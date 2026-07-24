'use client';

import { useEffect } from 'react';
import { recordBrandEvent } from '@/lib/brand';

/**
 * When someone lands on an event page from a Shareable Card (?source=shareable_card),
 * count it as card reach (`shareable_card.viewed`) against the event's brand.
 * Paired with `shareable_card.generated`, this yields the release's headline
 * metric: reach amplification per ticket. Fire-and-forget.
 */
export default function EventArrivalAnalytics({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;
    try {
      const source = new URLSearchParams(window.location.search).get('source');
      if (source === 'shareable_card') {
        recordBrandEvent(slug, 'shareable_card.viewed', 'event_arrival');
      }
    } catch {
      // best-effort
    }
  }, [slug]);

  return null;
}
