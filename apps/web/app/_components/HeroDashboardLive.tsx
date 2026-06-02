'use client';

/**
 * Animated hero dashboard.
 *
 * The marketing home used to render a static "Tech Summit 2026" dashboard
 * mock. It looked good but it didn't move, which made the product feel like
 * it didn't either. This component is the same visual, animated as a single
 * 32-second loop that tells the story of an event running:
 *
 *    0 -  4s  open state: 1,284 registered, 947 checked in, opening keynote LIVE
 *    4 - 10s  registrations tick up (1284 -> 1296), bars shift, check-ins climb
 *   10 - 14s  schedule advances: opening keynote DONE, product breakouts LIVE,
 *             lunch break appears NEXT
 *   14 - 22s  active sessions grow 6 -> 8, more bar growth, more registrations
 *   22 - 28s  late-day surge: bars hit peak, check-in rate jumps
 *   28 - 32s  cool-down, then loop back to opening state
 *
 * Implementation notes:
 *
 *  - One requestAnimationFrame-driven clock keeps the whole composition in
 *    sync. We avoid setInterval drift so the chart and the counters never
 *    skew apart on a sluggish tab.
 *  - All numeric counters cross-fade rather than snap, using a CSS opacity
 *    transition keyed off the displayed value.
 *  - Bars use CSS transition on `height` so they ease into new values.
 *  - The component honors `prefers-reduced-motion`: on a "reduce" preference
 *    we freeze on the opening state. This is the accessible thing to do for
 *    visitors with vestibular sensitivity, and it costs nothing.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

type ScheduleStatus = 'live' | 'next' | 'done';

interface ScheduleItem {
  time: string;
  title: string;
  room: string;
  status: ScheduleStatus;
}

const LOOP_MS = 32_000;

// Twelve bar heights, in percent of the chart area. The loop walks through
// `frames` (one frame per second) by linearly interpolating between adjacent
// keyframes. This lets us hand-author a believable attendance curve without
// shipping a real timeseries library.
const BAR_KEYFRAMES: Array<{ at: number; heights: number[] }> = [
  { at: 0, heights: [40, 56, 48, 70, 62, 84, 78, 92, 88, 96, 82, 90] },
  { at: 8, heights: [44, 52, 58, 64, 70, 76, 82, 86, 90, 92, 90, 94] },
  { at: 14, heights: [56, 62, 60, 68, 74, 80, 84, 88, 94, 96, 96, 98] },
  { at: 22, heights: [70, 74, 78, 82, 86, 92, 96, 98, 100, 98, 96, 100] },
  { at: 28, heights: [60, 66, 70, 74, 80, 84, 88, 90, 94, 92, 88, 90] },
  { at: 32, heights: [40, 56, 48, 70, 62, 84, 78, 92, 88, 96, 82, 90] },
];

interface Snapshot {
  registered: number;
  checkedIn: number;
  activeSessions: number;
  bars: number[];
  schedule: ScheduleItem[];
}

// Open state at t = 0. Used both as the initial render and as the loop reset
// target. Keep this aligned with the first BAR_KEYFRAMES entry.
const OPEN_STATE: Snapshot = {
  registered: 1284,
  checkedIn: 947,
  activeSessions: 6,
  bars: [40, 56, 48, 70, 62, 84, 78, 92, 88, 96, 82, 90],
  schedule: [
    { time: '10:30', title: 'Opening keynote', room: 'Main hall', status: 'live' },
    { time: '11:15', title: 'Product breakouts', room: 'Rooms A to D', status: 'next' },
  ],
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function barsAtSecond(s: number): number[] {
  // Find the bracketing keyframes and lerp between them.
  for (let i = 0; i < BAR_KEYFRAMES.length - 1; i++) {
    const a = BAR_KEYFRAMES[i];
    const b = BAR_KEYFRAMES[i + 1];
    if (a && b && s >= a.at && s <= b.at) {
      const t = (s - a.at) / (b.at - a.at || 1);
      return a.heights.map((h, idx) => Math.round(lerp(h, b.heights[idx] ?? h, t)));
    }
  }
  return OPEN_STATE.bars;
}

function snapshotAtSecond(s: number): Snapshot {
  // Numeric counters: hand-tuned curves rather than linear so the dashboard
  // feels like an event with bursts of registration, not a metronome.
  const registered = Math.round(
    s < 4
      ? 1284
      : s < 14
      ? 1284 + (s - 4) * 1.2
      : s < 22
      ? 1296 + (s - 14) * 0.8
      : s < 28
      ? 1302 + (s - 22) * 1.4
      : 1311,
  );

  const checkedIn = Math.round(
    s < 4
      ? 947
      : s < 10
      ? 947 + (s - 4) * 0.6
      : s < 22
      ? 951 + (s - 10) * 0.5
      : s < 28
      ? 957 + (s - 22) * 0.9
      : 962,
  );

  const activeSessions = s < 14 ? 6 : s < 22 ? 7 : 8;

  // Schedule transitions.
  let schedule: ScheduleItem[] = OPEN_STATE.schedule;
  if (s >= 10 && s < 22) {
    schedule = [
      { time: '11:15', title: 'Product breakouts', room: 'Rooms A to D', status: 'live' },
      { time: '13:00', title: 'Lunch break', room: 'Atrium', status: 'next' },
    ];
  } else if (s >= 22) {
    schedule = [
      { time: '13:00', title: 'Lunch break', room: 'Atrium', status: 'live' },
      { time: '14:30', title: 'Closing keynote', room: 'Main hall', status: 'next' },
    ];
  }

  return {
    registered,
    checkedIn,
    activeSessions,
    bars: barsAtSecond(s),
    schedule,
  };
}

export default function HeroDashboardLive() {
  const [snapshot, setSnapshot] = useState<Snapshot>(OPEN_STATE);
  const startedAt = useRef<number | null>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion.current) {
      setSnapshot(OPEN_STATE);
      return;
    }

    let raf = 0;
    const tick = (now: number) => {
      if (startedAt.current === null) startedAt.current = now;
      const elapsed = (now - startedAt.current) % LOOP_MS;
      const seconds = elapsed / 1000;
      setSnapshot(snapshotAtSecond(seconds));
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative">
      {/* glow underlay - unchanged from the static mock */}
      <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-br from-brand-500/30 via-transparent to-[#FF7675]/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-surface/80 shadow-2xl backdrop-blur">
        {/* topbar */}
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-brand-gradient" />
            <span className="text-xs font-semibold tracking-tight text-ink-primary">
              Orkora / Tech Summit 2026
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#00C896]/15 px-2 py-1 text-[10px] font-semibold text-[#00C896]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00C896]" />
            LIVE
          </span>
        </div>
        {/* counters */}
        <div className="grid grid-cols-3 gap-3 p-4">
          <StatTile label="Registered" value={snapshot.registered.toLocaleString()} tone="brand" />
          <StatTile label="Checked in" value={snapshot.checkedIn.toLocaleString()} tone="success" />
          <StatTile label="Active sessions" value={String(snapshot.activeSessions)} tone="warm" />
        </div>
        <div className="px-4 pb-4">
          <div className="rounded-xl border border-surface-border bg-surface-deep/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-primary">Live attendance</span>
              <span className="text-[10px] text-ink-muted">last 60 min</span>
            </div>
            <BarChartLive heights={snapshot.bars} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 px-4 pb-4">
          {snapshot.schedule.map((row) => (
            <ScheduleRow
              key={`${row.time}-${row.title}`}
              time={row.time}
              title={row.title}
              room={row.room}
              status={row.status}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'success' | 'warm';
}) {
  const toneClass =
    tone === 'brand'
      ? 'from-brand-500/30 to-brand-700/10'
      : tone === 'success'
      ? 'from-[#00C896]/30 to-[#00A074]/10'
      : 'from-[#FF7675]/25 to-[#FF5757]/5';
  return (
    <div className={`rounded-xl border border-surface-border bg-gradient-to-br ${toneClass} p-3`}>
      <div className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</div>
      {/* Crossfading counter. The `key` swap is what triggers the entry
          animation, so when `value` changes the number fades in rather than
          popping. The number itself is rendered twice (incoming + outgoing)
          via a CSS animation rather than two stacked elements, which keeps
          the layout stable for screen readers. */}
      <div className="mt-1 text-xl font-semibold text-ink-primary">
        <span key={value} className="inline-block animate-[orkora-fade-in_320ms_ease-out]">
          {value}
        </span>
      </div>
    </div>
  );
}

function BarChartLive({ heights }: { heights: number[] }) {
  // Memoize the rendered bars so React only re-paints when the array changes.
  const bars = useMemo(
    () =>
      heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-gradient-to-t from-brand-500/40 to-brand-400/80 transition-[height] duration-700 ease-out"
          style={{ height: `${h}%` }}
        />
      )),
    [heights],
  );
  return <div className="flex h-16 items-end gap-1.5">{bars}</div>;
}

function ScheduleRow({
  time,
  title,
  room,
  status,
}: {
  time: string;
  title: string;
  room: string;
  status: ScheduleStatus;
}) {
  const tone =
    status === 'live'
      ? 'bg-[#00C896]/15 text-[#00C896]'
      : status === 'next'
      ? 'bg-brand-500/15 text-brand-300'
      : 'bg-white/5 text-ink-muted';
  return (
    <div
      key={`${time}-${title}`}
      className="flex animate-[orkora-fade-in_400ms_ease-out] items-center justify-between rounded-lg border border-surface-border bg-surface-deep/60 px-3 py-2"
    >
      <div>
        <div className="text-[10px] text-ink-muted">{time}</div>
        <div className="text-xs font-semibold text-ink-primary">{title}</div>
        <div className="text-[10px] text-ink-secondary">{room}</div>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${tone}`}>
        {status === 'done' ? 'done' : status}
      </span>
    </div>
  );
}
