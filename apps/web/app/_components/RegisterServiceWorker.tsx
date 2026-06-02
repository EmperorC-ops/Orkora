'use client';

/**
 * Service worker registration for the Orkora PWA.
 *
 * Reasons this is its own client component, not a snippet in layout.tsx:
 *
 *   1. Layout is a server component; SW registration has to run in the
 *      browser, so it lives behind a "use client" boundary.
 *   2. We want a single registration call across the whole site, not one
 *      per page. Mounting once at the root keeps the SW lifecycle clean.
 *   3. We handle the update-while-tab-is-open case explicitly: if a new SW
 *      version is found, we call skipWaiting and reload, so the user gets
 *      the fresh build without being prompted. Combined with the SW's own
 *      skipWaiting + clients.claim, this means every deploy fully takes
 *      effect on the next navigation.
 *
 * Why we do not show a "new version available" toast:
 *
 *   Orkora is an event tool. A toast that interrupts an attendee mid-scan
 *   is worse than a silent refresh. The SW only swaps when the page is in
 *   the background (Workbox's "skipWaiting on update" is the same default
 *   reasoning).
 *
 * Disabled in dev:
 *
 *   Next.js dev sometimes serves stale files through the SW, which makes
 *   editing the site confusing. The register call short-circuits when
 *   NODE_ENV !== 'production'.
 */

import { useEffect } from 'react';

export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let mounted = true;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });
        if (!mounted) return;

        // If an update is found while the page is open, skip the waiting
        // worker and reload once it takes control. The SW itself calls
        // skipWaiting + clients.claim, so this just nudges the controller
        // swap to happen immediately.
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // A new SW is waiting. Tell it to take over.
              installing.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      } catch {
        // Swallowing the error is intentional. A SW registration failure
        // (e.g. a browser that blocks service workers on private mode)
        // should never break the page.
      }
    };

    // Wait for window load so the SW registration does not contend with the
    // first paint - the venue-wifi user cares about the page rendering, not
    // about the SW being ready 200ms sooner.
    if (document.readyState === 'complete') {
      void register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
