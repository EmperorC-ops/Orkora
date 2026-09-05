'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';

type Phase = 'before' | 'now' | 'ended';

export type Urgency = { text: string; tone: 'hot' | 'info' } | null;

function phaseFor(startMs: number, endMs: number, now: number): Phase {
  if (now < startMs) return 'before';
  if (now <= endMs) return 'now';
  return 'ended';
}

// Turn a millisecond gap into a human countdown. Above a day we drop seconds
// (they are noise at that range); inside the final day we show the full
// hh:mm:ss so the last stretch feels live, the way a showtime clock should.
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(mins)}m`;
  return `${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
}

function UrgencyPill({ urgency }: { urgency: Urgency }) {
  if (!urgency) return null;
  const tone =
    urgency.tone === 'hot'
      ? 'border-amber-300/30 bg-amber-400/15 text-amber-200'
      : 'border-brand-400/30 bg-brand-500/15 text-brand-200';
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
      {urgency.text}
    </span>
  );
}

/**
 * The moment band under the hero. A live countdown before the event, a
 * "Happening now" state during it, and an ended state after. The urgency line
 * is resolved on the server from real ticket data and passed in, so this
 * component never invents scarcity; it only counts down the clock.
 */
export default function EventCountdown({
  startAt,
  endAt,
  status,
  liveHref,
  urgency = null,
}: {
  startAt: string;
  endAt: string;
  status: string;
  liveHref?: string | null;
  urgency?: Urgency;
}) {
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Before mount, fall back to the server-authoritative status so the first
  // client render matches the server HTML (no hydration mismatch). Once the
  // clock is running, time decides the phase. Checking `now !== null` inline
  // lets TypeScript narrow it to a number in the branches below.
  const phase: Phase =
    now !== null
      ? phaseFor(startMs, endMs, now)
      : status === 'ended'
        ? 'ended'
        : status === 'live'
          ? 'now'
          : 'before';

  return (
    <section className="border-b border-surface-border bg-surface/70 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        {phase === 'before' && (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
              Starts in
            </span>
            <span
              aria-hidden="true"
              className="font-mono text-base font-bold tabular-nums text-ink-primary"
            >
              {now !== null ? formatCountdown(startMs - now) : '--'}
            </span>
          </>
        )}

        {phase === 'now' && (
          <>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Happening now
            </span>
            {liveHref ? (
              <Link
                href={liveHref as Route}
                className="rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600"
              >
                Join live
              </Link>
            ) : null}
          </>
        )}

        {phase === 'ended' && (
          <span className="text-sm font-medium text-ink-secondary">This event has ended</span>
        )}

        {phase !== 'ended' && (
          <div className="ml-auto">
            <UrgencyPill urgency={urgency} />
          </div>
        )}
      </div>
    </section>
  );
}
