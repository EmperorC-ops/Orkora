'use client';

import { useEffect } from 'react';

/**
 * Story Mode engagement emitter. Fire-and-forget, best-effort, and completely
 * silent: analytics must never affect the reader. Captures the page view, each
 * block's first impression (IntersectionObserver), scroll-depth milestones, and
 * the moment the tickets block is reached. Events are queued and flushed with
 * sendBeacon on an interval and when the tab is hidden/unloaded.
 *
 * No PII: the visitor id is a random per-tab token, not tied to any identity.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Emit = { kind: string; blockType?: string; blockIndex?: number; depthPercent?: number };

function visitorId(): string {
  try {
    const key = 'orkora_story_vid';
    let v = sessionStorage.getItem(key);
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(key, v);
    }
    return v;
  } catch {
    return 'anon';
  }
}

export default function StoryAnalytics({ code }: { code: string }) {
  useEffect(() => {
    const url = `${API}/v1/events/by-code/${encodeURIComponent(code)}/story-analytics`;
    const visitor = visitorId();
    let queue: Emit[] = [];

    function flush() {
      if (queue.length === 0) return;
      const batch = queue;
      queue = [];
      const body = JSON.stringify({ visitor, events: batch });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        } else {
          void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
        }
      } catch {
        // ignore: analytics is best-effort
      }
    }

    const push = (e: Emit) => {
      queue.push(e);
      if (queue.length >= 20) flush();
    };

    // Page view.
    push({ kind: 'event_view' });

    // Per-block first impression.
    const seenBlocks = new Set<number>();
    const blockEls = Array.from(document.querySelectorAll<HTMLElement>('[data-story-block]'));
    const blockObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const idx = Number(el.dataset.blockIndex ?? '-1');
          if (idx < 0 || seenBlocks.has(idx)) continue;
          seenBlocks.add(idx);
          push({ kind: 'block_viewed', blockType: el.dataset.blockType, blockIndex: idx });
          blockObserver.unobserve(el);
        }
      },
      { threshold: 0.4 },
    );
    blockEls.forEach((el) => blockObserver.observe(el));

    // Tickets reached.
    let ticketsObserver: IntersectionObserver | null = null;
    const tickets = document.getElementById('tickets');
    if (tickets) {
      ticketsObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            push({ kind: 'tickets_scrolled_to' });
            ticketsObserver?.disconnect();
          }
        },
        { threshold: 0.2 },
      );
      ticketsObserver.observe(tickets);
    }

    // Scroll depth milestones.
    const seenDepth = new Set<number>();
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      if (scrollable <= 0) return;
      const pct = Math.min(100, Math.round((doc.scrollTop / scrollable) * 100));
      for (const milestone of [25, 50, 75, 100]) {
        if (pct >= milestone && !seenDepth.has(milestone)) {
          seenDepth.add(milestone);
          push({ kind: 'scroll_depth', depthPercent: milestone });
        }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    const interval = window.setInterval(flush, 10_000);
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);

    return () => {
      flush();
      blockObserver.disconnect();
      ticketsObserver?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [code]);

  return null;
}
