'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Film, Link2, Loader2, Trash2, Upload } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import {
  eventsApi,
  readActiveOrgId,
  type EventSession,
  type EventTier,
} from '@/lib/events';
import {
  recordingsApi,
  formatDuration,
  type CreateRecordingInput,
  type Recording,
  type RecordingSource,
  type RecordingVisibility,
} from '@/lib/recordings';
import { ActionButton } from '@/components/action-button';

interface PresignResponse {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
}

const MAX_VIDEO_BYTES = 8 * 1024 * 1024; // matches MAX_UPLOAD_BYTES default (8 MB)

export default function EventRecordingsPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const [orgId, setOrgId] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [sessions, setSessions] = useState<EventSession[]>([]);
  const [tiers, setTiers] = useState<EventTier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (org: string) => {
    const [recs, evt, tierList] = await Promise.all([
      recordingsApi(org).list(eventId),
      eventsApi(org).get(eventId),
      eventsApi(org).listTiers(eventId),
    ]);
    setRecordings(recs);
    setSessions(evt.sessions ?? []);
    setTiers(tierList);
  }, [eventId]);

  useEffect(() => {
    const org = readActiveOrgId();
    setOrgId(org);
    if (!org || !eventId) {
      setLoading(false);
      return;
    }
    load(org)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [eventId, load]);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    const recs = await recordingsApi(orgId).list(eventId);
    setRecordings(recs);
  }, [orgId, eventId]);

  async function handleDelete(id: string) {
    if (!orgId) return;
    await recordingsApi(orgId).remove(eventId, id);
    await refresh();
  }

  async function handleTogglePublish(rec: Recording) {
    if (!orgId) return;
    await recordingsApi(orgId).update(eventId, rec.id, { publish: !rec.published });
    await refresh();
  }

  return (
    <div className="space-y-8 text-ink-primary">
      <Link
        href={`/dashboard/events/${eventId}`}
        className="inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to event
      </Link>

      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Library</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Recordings</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Publish session recordings for attendees. Gate them to any ticket holder
          or a specific tier, or make them public.
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-[#FF7675]/30 bg-[#FF7675]/5 p-4 text-sm text-[#FF9090]">
          {error}
        </div>
      )}

      <CreateRecordingForm
        orgId={orgId}
        eventId={eventId}
        sessions={sessions}
        tiers={tiers}
        onCreated={refresh}
        onError={setError}
      />

      <section className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center text-sm text-ink-secondary">
            Loading recordings...
          </div>
        ) : recordings.length === 0 ? (
          <div className="rounded-2xl border border-surface-border bg-surface/40 p-12 text-center">
            <Film className="mx-auto h-8 w-8 text-ink-muted" />
            <p className="mt-4 text-sm text-ink-secondary">
              No recordings yet. Add a link or upload a video above.
            </p>
          </div>
        ) : (
          recordings.map((rec) => (
            <RecordingRow
              key={rec.id}
              rec={rec}
              onDelete={() => handleDelete(rec.id)}
              onTogglePublish={() => handleTogglePublish(rec)}
              onError={setError}
            />
          ))
        )}
      </section>
    </div>
  );
}

/* ----------------------------- row ----------------------------- */

function RecordingRow({
  rec,
  onDelete,
  onTogglePublish,
  onError,
}: {
  rec: Recording;
  onDelete: () => Promise<void>;
  onTogglePublish: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const visLabel =
    rec.visibility === 'public'
      ? 'Public'
      : rec.visibility === 'tier'
        ? 'Tier only'
        : 'Ticket holders';
  const duration = formatDuration(rec.durationSec);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface/40 p-5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink-primary">{rec.title}</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
            {rec.source === 'link' ? (
              <Link2 className="h-3 w-3" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            {rec.source === 'link' ? 'Link' : 'Upload'}
          </span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-ink-secondary">
            {visLabel}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              rec.published
                ? 'bg-[#34D399]/15 text-[#34D399]'
                : 'bg-white/5 text-ink-muted'
            }`}
          >
            {rec.published ? 'Published' : 'Draft'}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-ink-muted">
          {rec.sessionTitle ? `${rec.sessionTitle} · ` : ''}
          {duration ? `${duration} · ` : ''}
          {rec.source === 'link' ? rec.url : rec.storageKey}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ActionButton
          variant="secondary"
          onAction={onTogglePublish}
          idleLabel={rec.published ? 'Unpublish' : 'Publish'}
          pendingLabel="Saving..."
          successLabel="Saved"
          onError={onError}
        />
        <ActionButton
          variant="danger"
          onAction={onDelete}
          idleLabel="Delete"
          pendingLabel="Deleting..."
          successLabel="Deleted"
          idleIcon={<Trash2 className="h-4 w-4" />}
          onError={onError}
        />
      </div>
    </div>
  );
}

/* ----------------------------- create form ----------------------------- */

function CreateRecordingForm({
  orgId,
  eventId,
  sessions,
  tiers,
  onCreated,
  onError,
}: {
  orgId: string | null;
  eventId: string;
  sessions: EventSession[];
  tiers: EventTier[];
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<RecordingSource>('link');
  const [url, setUrl] = useState('');
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<RecordingVisibility>('ticket');
  const [requiredTierId, setRequiredTierId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [publish, setPublish] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const inputClass =
    'w-full rounded-xl border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-500/60 focus:outline-none';

  async function handleVideo(file: File) {
    onError('');
    if (file.size > MAX_VIDEO_BYTES) {
      onError('Video is over the 8 MB upload limit. Use a link for larger files.');
      return;
    }
    if (!file.type.startsWith('video/')) {
      onError('Choose a video file, or switch to a link.');
      return;
    }
    setUploading(true);
    try {
      const presign = await apiFetch<PresignResponse>('/v1/uploads/presign', {
        method: 'POST',
        json: {
          kind: 'recording',
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
      setStorageKey(presign.key);
      setUploadedName(file.name);
    } catch (err) {
      onError((err as Error).message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function reset() {
    setTitle('');
    setDescription('');
    setUrl('');
    setStorageKey(null);
    setUploadedName(null);
    setVisibility('ticket');
    setRequiredTierId('');
    setSessionId('');
    setPublish(true);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit() {
    if (!orgId) throw new Error('No organization selected.');
    if (title.trim().length < 2) throw new Error('Give the recording a title.');
    if (source === 'link' && !url.trim()) throw new Error('Enter a video URL.');
    if (source === 'upload' && !storageKey) throw new Error('Upload a video first.');
    if (visibility === 'tier' && !requiredTierId) {
      throw new Error('Pick a tier for tier-gated access.');
    }

    const input: CreateRecordingInput = {
      title: title.trim(),
      source,
      visibility,
      publish,
    };
    if (description.trim()) input.description = description.trim();
    if (source === 'link') input.url = url.trim();
    else if (storageKey) input.storageKey = storageKey;
    if (visibility === 'tier') input.requiredTierId = requiredTierId;
    if (sessionId) input.sessionId = sessionId;

    await recordingsApi(orgId).create(eventId, input);
    reset();
    await onCreated();
  }

  return (
    <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
      <h3 className="text-sm font-semibold text-ink-primary">Add a recording</h3>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Title
          </span>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Opening keynote"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Description (optional)
          </span>
          <textarea
            className={`${inputClass} min-h-[72px] resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short summary of the recording."
          />
        </label>

        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Source
          </span>
          <div className="inline-flex overflow-hidden rounded-xl border border-surface-border">
            <button
              type="button"
              onClick={() => setSource('link')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition ${
                source === 'link'
                  ? 'bg-brand-500/20 text-brand-200'
                  : 'text-ink-secondary hover:bg-white/5'
              }`}
            >
              <Link2 className="h-4 w-4" /> Link
            </button>
            <button
              type="button"
              onClick={() => setSource('upload')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition ${
                source === 'upload'
                  ? 'bg-brand-500/20 text-brand-200'
                  : 'text-ink-secondary hover:bg-white/5'
              }`}
            >
              <Upload className="h-4 w-4" /> Upload
            </button>
          </div>
        </div>

        {source === 'link' ? (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Video URL
            </span>
            <input
              className={inputClass}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtu.be/... or an .m3u8 / .mp4 URL"
            />
            <span className="mt-1 block text-xs text-ink-muted">
              YouTube and Vimeo links embed automatically. Direct mp4/HLS URLs play
              in the built-in player.
            </span>
          </label>
        ) : (
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Video file
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-xl border border-surface-border bg-surface-deep/60 px-4 py-2 text-sm font-semibold text-ink-primary transition hover:bg-white/5 disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploadedName ? 'Replace video' : 'Choose video'}
              </button>
              {uploadedName && (
                <span className="truncate text-xs text-ink-secondary">
                  {uploadedName}
                </span>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleVideo(f);
              }}
            />
            <span className="mt-1 block text-xs text-ink-muted">
              Up to 8 MB. For longer sessions, host on YouTube/Vimeo/a CDN and use a
              link instead.
            </span>
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Visibility
          </span>
          <select
            className={inputClass}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as RecordingVisibility)}
          >
            <option value="public">Public (anyone)</option>
            <option value="ticket">Ticket holders</option>
            <option value="tier">Specific tier</option>
          </select>
        </label>

        {visibility === 'tier' && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Tier
            </span>
            <select
              className={inputClass}
              value={requiredTierId}
              onChange={(e) => setRequiredTierId(e.target.value)}
            >
              <option value="">Select a tier...</option>
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Session (optional)
          </span>
          <select
            className={inputClass}
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            <option value="">Event overall</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
            className="h-4 w-4 rounded border-surface-border bg-surface-deep"
          />
          Publish immediately
        </label>
        <ActionButton
          variant="primary"
          onAction={submit}
          idleLabel="Add recording"
          pendingLabel="Saving..."
          successLabel="Added"
          idleIcon={<Film className="h-4 w-4" />}
          onError={onError}
          disabled={uploading}
        />
      </div>
    </section>
  );
}
