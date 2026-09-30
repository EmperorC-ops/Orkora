'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * A slim "Happening now" band for the Story Mode event page, which does not use
 * the classic EventCountdown. It shows only while the event is live (between its
 * start and end), and links attendees to the live second screen. Purely clock
 * driven, like EventCountdown, so it needs no status flip; before hydration it
 * falls back to the server status so the first paint matches.
 */
export default function StoryLiveBar({
  code,
  startAt,
  endAt,
  status,
}: {
  code: string;
  startAt: string;
  endAt: string;
  status: string;
}) {
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const live = now !== null ? now >= startMs && now <= endMs : status === 'live';
  if (!live) return null;

  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
      <span className="inline-flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
        Happening now
      </span>
      <Link
        href={`/e/${code}/live`}
        className="rounded-full bg-white/20 px-4 py-1 font-semibold text-white transition hover:bg-white/30"
      >
        Join the live event
      </Link>
    </div>
  );
}
