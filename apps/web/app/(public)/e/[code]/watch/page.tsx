'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Film, Loader2, Lock, PlayCircle } from 'lucide-react';
import {
  listPublicRecordings,
  playRecording,
  formatDuration,
  type Playback,
  type PublicRecording,
} from '@/lib/recordings';

export default function WatchPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code ?? '';
  const [recordings, setRecordings] = useState<PublicRecording[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<PublicRecording | null>(null);

  useEffect(() => {
    if (!code) return;
    listPublicRecordings(code)
      .then(setRecordings)
      .catch((err: Error) => setError(err.message));
  }, [code]);

  return (
    <main className="min-h-screen bg-surface-deep text-ink-primary">
      <header className="border-b border-surface-border bg-brand-gradient text-white">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-100">
            Recording library
          </p>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Watch on demand</h1>
          <p className="mt-3 max-w-2xl text-sm text-brand-50">
            Session recordings for this event. Some are open to everyone; others
            unlock with your ticket code.
          </p>
          <Link
            href={`/e/${code}`}
            className="mt-5 inline-block rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium backdrop-blur hover:bg-white/20"
          >
            Back to event
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-12">
        {error ? (
          <div className="rounded-2xl border border-[#FF7675]/30 bg-[#FF7675]/5 p-6 text-sm text-[#FF9090]">
            {error}
          </div>
        ) : recordings === null ? (
          <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center text-sm text-ink-secondary">
            Loading recordings...
          </div>
        ) : recordings.length === 0 ? (
          <div className="rounded-2xl border border-surface-border bg-surface/40 p-12 text-center">
            <Film className="mx-auto h-8 w-8 text-ink-muted" />
            <p className="mt-4 text-sm text-ink-secondary">
              No recordings have been published for this event yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {recordings.map((rec) => (
              <button
                key={rec.id}
                type="button"
                onClick={() => setActive(rec)}
                className="group flex flex-col gap-2 rounded-2xl border border-surface-border bg-surface/40 p-5 text-left transition hover:border-brand-500/40 hover:bg-surface/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <PlayCircle className="h-8 w-8 shrink-0 text-brand-300 transition group-hover:text-brand-200" />
                  {rec.requiresTicket ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-ink-secondary">
                      <Lock className="h-3 w-3" />
                      {rec.visibility === 'tier' ? 'Tier only' : 'Ticket'}
                    </span>
                  ) : (
                    <span className="rounded-full bg-[#34D399]/15 px-2 py-0.5 text-[11px] font-semibold text-[#34D399]">
                      Free
                    </span>
                  )}
                </div>
                <p className="font-semibold text-ink-primary">{rec.title}</p>
                {rec.sessionTitle && (
                  <p className="text-xs text-brand-300">{rec.sessionTitle}</p>
                )}
                {rec.description && (
                  <p className="line-clamp-2 text-sm text-ink-secondary">
                    {rec.description}
                  </p>
                )}
                {formatDuration(rec.durationSec) && (
                  <p className="mt-auto text-xs text-ink-muted">
                    {formatDuration(rec.durationSec)}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {active && (
        <PlayerModal code={code} recording={active} onClose={() => setActive(null)} />
      )}
    </main>
  );
}

/* ----------------------------- player modal ----------------------------- */

function PlayerModal({
  code,
  recording,
  onClose,
}: {
  code: string;
  recording: PublicRecording;
  onClose: () => void;
}) {
  const [ticketCode, setTicketCode] = useState('');
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Public recordings resolve immediately; gated ones wait for a ticket code.
  useEffect(() => {
    if (recording.requiresTicket) return;
    setBusy(true);
    playRecording(code, recording.id)
      .then(setPlayback)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }, [code, recording]);

  async function unlock() {
    setError(null);
    setBusy(true);
    try {
      const pb = await playRecording(code, recording.id, ticketCode.trim());
      setPlayback(pb);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-surface-border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-primary">
              {recording.title}
            </h2>
            {recording.sessionTitle && (
              <p className="text-xs text-brand-300">{recording.sessionTitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary"
          >
            Close
          </button>
        </div>

        <div className="mt-4">
          {playback ? (
            <Player playback={playback} />
          ) : recording.requiresTicket && !busy ? (
            <div className="rounded-xl border border-surface-border bg-surface-deep/60 p-6">
              <div className="flex items-center gap-2 text-sm text-ink-secondary">
                <Lock className="h-4 w-4 text-brand-300" />
                {recording.visibility === 'tier'
                  ? 'This recording is for a specific ticket tier.'
                  : 'This recording is for ticket holders.'}
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={ticketCode}
                  onChange={(e) => setTicketCode(e.target.value)}
                  placeholder="Enter your ticket code"
                  className="w-full rounded-xl border border-surface-border bg-surface-deep px-3 py-2 text-sm uppercase tracking-wider text-ink-primary placeholder:text-ink-muted placeholder:normal-case placeholder:tracking-normal focus:border-brand-500/60 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void unlock();
                  }}
                />
                <button
                  type="button"
                  onClick={() => void unlock()}
                  disabled={busy || !ticketCode.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow transition hover:opacity-95 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Watch
                </button>
              </div>
              {error && (
                <p className="mt-3 rounded-lg bg-[#FF7675]/10 px-3 py-2 text-xs text-[#FF9090]">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-surface-border bg-surface-deep/60 p-12 text-sm text-ink-secondary">
              {error ? (
                <span className="text-[#FF9090]">{error}</span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading player...
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the resolved playback URL. YouTube / Vimeo links become iframe
 * embeds; everything else (direct mp4, or HLS .m3u8) plays via a native
 * <video> element. Note: HLS in <video> works natively in Safari; other
 * browsers may need an HLS shim, which we intentionally skip to keep this
 * lightweight. Standard mp4 links play everywhere.
 */
function Player({ playback }: { playback: Playback }) {
  const embed = toEmbedUrl(playback.playbackUrl);
  if (embed) {
    return (
      <div className="aspect-video overflow-hidden rounded-xl bg-black">
        <iframe
          src={embed}
          title={playback.title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <div className="aspect-video overflow-hidden rounded-xl bg-black">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video src={playback.playbackUrl} controls className="h-full w-full" />
    </div>
  );
}

/**
 * Map a YouTube or Vimeo watch URL to its embeddable form. Returns null for any
 * URL we do not recognize (direct video files, HLS, etc.), so the caller falls
 * back to a native <video> element.
 */
function toEmbedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');

  // YouTube: youtu.be/<id>, youtube.com/watch?v=<id>, /embed/<id>, /live/<id>.
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (u.pathname === '/watch') {
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    const m = u.pathname.match(/^\/(embed|live|shorts)\/([^/]+)/);
    if (m) return `https://www.youtube.com/embed/${m[2]}`;
    return null;
  }

  // Vimeo: vimeo.com/<id> -> player.vimeo.com/video/<id>.
  if (host === 'vimeo.com') {
    const id = u.pathname.split('/').filter(Boolean)[0];
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === 'player.vimeo.com') {
    return raw;
  }

  return null;
}
