'use client';

import { useEffect, useState } from 'react';

interface Props {
  startAt: string;
  endAt: string;
  status: string;
  // Server-computed, real-data-only urgency line (e.g. "Only 8 left").
  // Null when the event has no genuine scarcity or sale-window signal.
  urgency?: string | null;
}

function breakdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    Days: Math.floor(s / 86400),
    Hrs: Math.floor((s % 86400) / 3600),
    Min: Math.floor((s % 3600) / 60),
    Sec: s % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

// Countdown-to-doors band. Targets the absolute start instant, so it is
// timezone-safe: it reads the same wherever the visitor is. The ticking part
// runs client-side; `now` stays null until mount so the server and first
// client render agree (no hydration mismatch), then the numbers fill in.
export default function EventCountdown({ startAt, endAt, status, urgency }: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (status === 'ended' || status === 'archived') return null;

  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (now !== null && now > end) return null;

  const live = now !== null && now >= start;
  const remaining = now === null ? null : Math.max(0, start - now);
  const b = remaining === null ? null : breakdown(remaining);

  const cells: Array<{ label: 'Days' | 'Hrs' | 'Min' | 'Sec' }> = [
    { label: 'Days' },
    { label: 'Hrs' },
    { label: 'Min' },
    { label: 'Sec' },
  ];

  return (
    <section className="relative z-10 mx-auto -mt-8 max-w-5xl px-6">
      <div className="surface-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {live ? (
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-lg font-bold text-ink-primary">Happening now</span>
          </div>
        ) : (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
              Starts in
            </p>
            <div className="flex gap-2.5">
              {cells.map(({ label }) => {
                const val = b ? b[label] : null;
                return (
                  <div
                    key={label}
                    className="flex min-w-[3.25rem] flex-col items-center rounded-xl bg-surface-raised px-3 py-2"
                  >
                    <span className="text-2xl font-extrabold tabular-nums text-brand-300">
                      {val === null ? '--' : label === 'Days' ? val : pad(val)}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {urgency ? (
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-[#FF7675]/15 px-4 py-1.5 text-sm font-semibold text-[#FF9090] sm:self-auto">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FF9090]" />
            {urgency}
          </span>
        ) : null}
      </div>
    </section>
  );
}
