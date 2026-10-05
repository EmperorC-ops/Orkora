'use client';

/**
 * Installed-app launcher (the PWA's start_url).
 *
 * A PWA launches to one fixed URL. Before this route that was the homepage,
 * so an attendee who installed Orkora from their ticket and tapped the icon
 * at the door landed on marketing copy instead of their QR code. This page
 * decides, on the device, where the launch should actually go:
 *
 *   1. Signed in (a session is live, or the httpOnly refresh cookie can mint
 *      one)                                -> /me/tickets
 *   2. Otherwise, a ticket was viewed on this device (lib/pwa remembers the
 *      last code; ticket pages are public by code and cached offline by the
 *      service worker)                      -> /t/<code>
 *   3. Nothing known                        -> /
 *
 * Offline: the refresh call fails fast and we fall through to the cached
 * ticket, which is the whole point of installing. The service worker serves
 * this page itself from cache (see sw.js) so launch never hits /offline.html.
 *
 * router.replace keeps /app out of history so Back does not bounce through
 * the launcher.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { refreshSession } from '@/lib/auth';
import { readLastTicket } from '@/lib/pwa';

// Do not let a slow network hold the launch hostage; the cached ticket is a
// perfectly good destination if the session check cannot answer quickly.
const SESSION_CHECK_TIMEOUT_MS = 2500;

function hasLiveSession(): boolean {
  try {
    return !!window.sessionStorage.getItem('access_token');
  } catch {
    return false;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

export default function AppLauncherPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'deciding' | 'routing'>('deciding');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const lastTicket = readLastTicket();

      let signedIn = hasLiveSession();
      if (!signedIn) {
        signedIn = await withTimeout(refreshSession(), SESSION_CHECK_TIMEOUT_MS, false);
      }
      if (cancelled) return;
      setStatus('routing');

      if (signedIn) {
        router.replace('/me/tickets');
      } else if (lastTicket) {
        router.replace(`/t/${encodeURIComponent(lastTicket)}`);
      } else {
        router.replace('/');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-deep text-ink-primary">
      <div className="flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/orkora-mark.svg" alt="Orkora" className="h-14 w-14" />
        <p className="text-sm text-ink-secondary" aria-live="polite">
          {status === 'deciding' ? 'Opening Orkora' : 'One moment'}
        </p>
      </div>
    </main>
  );
}
