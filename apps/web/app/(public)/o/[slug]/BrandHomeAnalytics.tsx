'use client';

import { useEffect } from 'react';
import { recordBrandEvent } from '@/lib/brand';

/**
 * Emits a single `brand_home.viewed` event on load, tagged with the traffic
 * source (explicit ?source / ?utm_source, else the external referrer host, else
 * "direct"). Fire-and-forget; never blocks the page.
 */
export default function BrandHomeAnalytics({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;
    let source: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      source = params.get('source') || params.get('utm_source');
      if (!source) {
        const refHost = document.referrer ? new URL(document.referrer).host : '';
        source = refHost && refHost !== window.location.host ? refHost : 'direct';
      }
    } catch {
      source = 'direct';
    }
    recordBrandEvent(slug, 'brand_home.viewed', source);
  }, [slug]);

  return null;
}
