'use client';

import { useRef, useState } from 'react';
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

// Campaign flyers go inline into bulk email: still images only, smaller cap.
// Mirrors the API's campaign_flyer rules in uploads.service.ts.
const FLYER_ACCEPTED = 'image/png,image/jpeg,image/jpg,image/webp';
const FLYER_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export type UploadKind = 'banner' | 'avatar' | 'logo' | 'campaign_flyer';

interface Props {
  kind: UploadKind;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  /** Visual aspect ratio. Defaults sensibly per kind. */
  aspect?: 'banner' | 'square' | 'flyer';
  className?: string;
  label?: string;
}

export function ImageUpload({ kind, value, onChange, aspect, className, label }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const ratio =
    aspect ?? (kind === 'avatar' ? 'square' : kind === 'campaign_flyer' ? 'flyer' : 'banner');
  const isFlyer = kind === 'campaign_flyer';
  const maxBytes = isFlyer ? FLYER_MAX_BYTES : MAX_BYTES;
  const typePattern = isFlyer
    ? /^image\/(png|jpeg|jpg|webp)$/i
    : /^image\/(png|jpeg|jpg|webp|gif)$/i;
  const typeHint = isFlyer ? 'PNG, JPEG, or WEBP' : 'PNG, JPEG, WEBP, or GIF';
  const sizeHint = isFlyer ? '5 MB' : '8 MB';

  async function handleFile(file: File) {
    setError(null);
    if (file.size > maxBytes) {
      setError(`File is over ${sizeHint}. Pick a smaller image.`);
      return;
    }
    if (!file.type.match(typePattern)) {
      setError(
        isFlyer
          ? 'Use a PNG, JPEG, or WEBP image. If your flyer is a PDF, export it as an image first.'
          : `Use a ${typeHint}.`,
      );
      return;
    }
    setBusy(true);
    try {
      // sizeBytes is declared up-front so the API can sign Content-Length
      // as a required header. We MUST send the same Content-Length on the
      // PUT or S3 rejects with SignatureDoesNotMatch.
      const presign = await apiFetch<PresignResponse>('/v1/uploads/presign', {
        method: 'POST',
        json: {
          kind,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        },
      });
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          'Content-Length': String(file.size),
        },
        body: file,
      });
      if (!put.ok) {
        const txt = await put.text().catch(() => '');
        throw new Error(`Upload failed (${put.status}): ${txt.slice(0, 120)}`);
      }
      setLoadError(false);
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

  const aspectClass =
    ratio === 'square' ? 'aspect-square' : ratio === 'flyer' ? 'aspect-[3/4]' : 'aspect-[16/7]';
  const radiusClass = ratio === 'square' ? 'rounded-full' : 'rounded-2xl';
  // Flyers are shown whole (never cropped) so the organizer previews exactly
  // what recipients will see.
  const fitClass = ratio === 'flyer' ? 'object-contain' : 'object-cover';

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
          // Plain <img> (not next/image) so the R2 public URL renders without
          // depending on the Image optimizer's remote-domain allowlist, which
          // is a common cause of "uploaded but the preview never appears".
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className={`absolute inset-0 h-full w-full ${fitClass}`}
            onError={() => setLoadError(true)}
            onLoad={() => setLoadError(false)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
            <ImagePlus className="h-6 w-6" />
            <span className="mt-2 text-xs">
              {ratio === 'square' ? 'Add avatar' : ratio === 'flyer' ? 'Add flyer image' : 'Add banner image'}
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
          accept={isFlyer ? FLYER_ACCEPTED : ACCEPTED}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-slate-500">
          {typeHint} up to {sizeHint}.
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

      {loadError && value ? (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The image uploaded but is not loading from its public URL. Confirm your media bucket allows public
          reads (S3_PUBLIC_BASE_URL / R2 public access).
        </p>
      ) : null}
    </div>
  );
}
