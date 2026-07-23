'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Moodboard with click-to-expand lightbox. Masonry grid on the page; tapping a
 * tile opens a full-screen overlay with the image, caption, and prev/next
 * navigation. Escape or a background click closes it.
 */
export default function Moodboard({ tiles }: { tiles: { url: string; caption: string | null }[] }) {
  const [open, setOpen] = useState<number | null>(null);

  const close = useCallback(() => setOpen(null), []);
  const step = useCallback(
    (dir: 1 | -1) => {
      setOpen((cur) => {
        if (cur === null) return cur;
        const next = (cur + dir + tiles.length) % tiles.length;
        return next;
      });
    },
    [tiles.length],
  );

  useEffect(() => {
    if (open === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, step]);

  if (tiles.length === 0) return null;
  const active = open !== null ? tiles[open] : null;

  return (
    <>
      <div className="columns-2 gap-4 sm:columns-3 [&>*]:mb-4">
        {tiles.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(i)}
            className="block w-full overflow-hidden rounded-xl border border-surface-border transition hover:opacity-90"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.url} alt={t.caption ?? ''} className="w-full" />
            {t.caption ? (
              <span className="block px-3 py-2 text-left text-xs text-ink-muted">{t.caption}</span>
            ) : null}
          </button>
        ))}
      </div>

      {active ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          {tiles.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              aria-label="Previous"
              className="absolute left-5 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : null}
          <figure className="max-h-[85vh] max-w-4xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={active.url} alt={active.caption ?? ''} className="max-h-[80vh] w-auto rounded-lg object-contain" />
            {active.caption ? (
              <figcaption className="mt-3 text-center text-sm text-white/80">{active.caption}</figcaption>
            ) : null}
          </figure>
          {tiles.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              aria-label="Next"
              className="absolute right-5 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
