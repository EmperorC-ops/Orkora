'use client';

import { useRef, useState } from 'react';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { apiFetch } from '@/lib/auth';

interface PresignResponse {
  key: string;
  uploadUrl: string;
  publicUrl: string;
}

// Mirrors the API's campaign_document rule in uploads.service.ts.
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export interface UploadedDocument {
  url: string;
  name: string;
  sizeBytes: number | null;
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * PDF upload for campaign documents (newsletters). Uploads straight to storage
 * through a presigned URL; the API then checks the file really is a PDF when
 * the campaign is saved.
 */
export function DocumentUpload({
  value,
  onChange,
}: {
  value: UploadedDocument | null;
  onChange: (doc: UploadedDocument | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      setError('Choose a PDF file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`A document can be at most 10 MB (this one is ${formatSize(file.size)}).`);
      return;
    }
    setBusy(true);
    try {
      const presign = await apiFetch<PresignResponse>('/v1/uploads/presign', {
        method: 'POST',
        json: {
          kind: 'campaign_document',
          filename: file.name,
          contentType: 'application/pdf',
          sizeBytes: file.size,
        },
      });
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(file.size) },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status}). Try again.`);
      onChange({ url: presign.publicUrl, name: file.name, sizeBytes: file.size });
    } catch (err) {
      setError((err as Error).message || 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-deep/40 px-3 py-2.5">
          <FileText className="h-5 w-5 flex-none text-brand-300" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-primary">{value.name}</div>
            <div className="text-xs text-ink-muted">PDF{value.sizeBytes ? ` · ${formatSize(value.sizeBytes)}` : ''}</div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-lg border border-surface-border p-2 text-ink-muted transition hover:text-[#FF9090]"
            aria-label="Remove document"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl border border-dashed border-surface-border px-4 py-2.5 text-sm text-ink-secondary transition hover:border-brand-500/60 hover:text-ink-primary disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? 'Uploading...' : 'Upload a PDF'}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      {error ? <p className="mt-1 text-xs text-[#FF9090]">{error}</p> : null}
    </div>
  );
}
