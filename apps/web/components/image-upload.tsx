'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/auth';

interface PresignResponse {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
}

const ACCEPTED = 'image/png,image/jpeg,image/jpg,image/webp,image/gif';
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export type UploadKind = 'banner' | 'avatar' | 'logo';

interface Props {
  kind: UploadKind;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  /** Visual aspect ratio. Defaults sensibly per kind. */
  aspect?: 'banner' | 'square';
  className?: string;
  label?: string;
}

export function ImageUpload({ kind, value, onChange, aspect, className, label }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ratio = aspect ?? (kind === 'avatar' ? 'square' : 'banner');

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError('File is over 8 MB. Pick a smaller image.');
      return;
    }
    if (!file.type.match(/^image\/(png|jpeg|jpg|webp|gif)$/i)) {
      setError('Use a PNG, JPEG, WEBP, or GIF.');
      return;
    }
    setBusy(true);
    try {
      const presign = await apiFetch<PresignResponse>('/v1/uploads/presign', {
        method: 'POST',
        json: { kind, filename: file.name, contentType: file.type },
      });
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) {
        const txt = await put.text().catch(() => '');
        throw new Error(`Upload failed (${put.status}): ${txt.slice(0, 120)}`);
      }
      onChange(presign.publicUrl);
    } catch (err) {
      setError((err as Error).message ?? 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const aspectClass = ratio === 'square' ? 'aspect-square' : 'aspect-[16/7]';
  const radiusClass = ratio === 'square' ? 'rounded-full' : 'rounded-2xl';

  return (
    <div className={className}>
      {label ? (
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
      ) : null}

      <div
        className={`group relative ${aspectClass} ${radiusClass} overflow-hidden border border-dashed border-slate-300 bg-slate-50 transition hover:border-brand-500/60`}
      >
        {value ? (
          <Image
            src={value}
            alt=""
            fill
            sizes={ratio === 'square' ? '128px' : '720px'}
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
            <ImagePlus className="h-6 w-6" />
            <span className="mt-2 text-xs">
              {ratio === 'square' ? 'Add avatar' : 'Add banner image'}
            </span>
          </div>
        )}

        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-slate-500">
          PNG, JPEG, WEBP, or GIF up to 8 MB.
        </span>
        {value ? (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 text-slate-500 transition hover:text-red-600"
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
