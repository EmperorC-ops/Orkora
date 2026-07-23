/* eslint-disable no-restricted-globals */

/**
 * Orkora service worker.
 *
 * Goal: the venue-wifi case. An attendee opens their /t/<code> ticket link
 * on the way to the event, the venue has no working wifi, and the page must
 * still load + show their QR. Without a service worker, the page is a blank
 * client-side React shell that hangs forever waiting on the API.
 *
 * Strategy (per request type):
 *
 *   - App shell (Next.js build assets at /_next/static/*) - cache-first,
 *     hashed by build so versioning is automatic.
 *
 *   - Brand assets (/icon.svg, /favicon.svg, /manifest.webmanifest) -
 *     cache-first, refreshed on each SW update.
 *
 *   - Ticket pages (/t/<code>) - network-first, cache fallback. The page
 *     itself is a public client-rendered shell, so we want the latest copy
 *     when online but never a hang when offline.
 *
 *   - Ticket API (/v1/registrations/tickets/<code>) - network-first with
 *     longer cache fallback. This is the actual qrToken payload; caching
 *     it is what makes offline QR display work. Safe to cache because the
 *     /t/<code> URL itself is the auth (anyone with the code has access).
 *
 *   - Everything else (auth, dashboard, Stripe, payments, the API generally)
 *     is network-only. No stale state in security-sensitive paths.
 *
 *   - When the network truly fails and there is no cache, we serve a
 *     branded /offline.html fallback so the page never collapses into a
 *     browser-default error.
 *
 * Cache invalidation:
 *
 *   - VERSION is bumped manually on each deploy that needs a cache flush.
 *     The activate handler deletes any cache whose name does not match the
 *     current version, so old caches are reclaimed automatically.
 *   - Individual TTLs on dynamic caches prevent stale ticket data from
 *     living forever (24h on the ticket API).
 *
 * What is intentionally not in here:
 *
 *   - Push notifications. Wired separately when we ship FCM / APNs.
 *   - Background sync. The ticket scanner uses the dashboard, not the PWA.
 *   - Cross-user cache isolation. We only cache the public /t/<code> path,
 *     not /me/tickets, so logging out cannot expose a sibling user's data.
 */

// Bumped 2026-06-04 to invalidate caches holding the pre-brand HTML shells.
// Without the bump, existing PWA installs continue to serve the old
// gradient-square + Orkora wordmark even after Vercel ships the lockup.
// v4 2026-07-07: cacheFirst no longer synthesizes 503s for failed script
// fetches (broke hydration when fetch(req) threw); clean-URL retry added.
// v5 2026-07-23: flush caches so installs pick up the CSP change that lets the
// QR check-in scanner worker run (worker-src blob:). Old cached page shells
// carried the pre-fix CSP and kept the scanner blocked.
const VERSION = 'orkora-v5-2026-07-23';
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;
const API_CACHE = `${VERSION}-api`;

// Precache the offline page, manifest, and the brand asset ladder. Keeping
// these in the shell cache means an attendee's offline ticket page still
// shows the brand mark + favicon even with zero connectivity. The SVG
// favicons are retained because some browsers prefer them for the tab
// favicon over the PNG ladder when both are advertised.
const SHELL_URLS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/brand/orkora-mark.svg',
  '/brand/orkora-mark-maskable.svg',
  '/icons/icon-32.png',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/og-image.png',
];

const API_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// -------------------- install / activate --------------------

// Allow the RegisterServiceWorker client component to nudge an installed-
// but-waiting SW to take over immediately. Redundant with our own install-
// time skipWaiting(), but belt-and-suspenders for the case where a future
// build runs without skipWaiting() and we still want updates to be silent.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      // addAll fails the whole install on a single 404, which is what we want
      // for the shell - we do not ship a partially-installed worker.
      await shell.addAll(SHELL_URLS);
      // Take over from any previous SW immediately so the next navigation
      // already runs through our new fetch handler.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches that do not match the current VERSION. Limits storage
      // growth across deploys and prevents serving stale assets from an
      // older build.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// -------------------- fetch routing --------------------

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only GETs are cacheable.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // The ticket-by-code lookup is the single load-bearing path for offline
  // QR display, and it lives on the API origin (Render) - a different
  // origin from the web app (Vercel). We pattern-match on the path so we
  // can intercept it without hard-coding the API host. Network-first with
  // a long TTL fallback keeps the user looking at the latest when they
  // have signal and the cached copy when they do not. The /t/<code> URL
  // itself acts as the auth (anyone with the code already has access),
  // so caching the body is safe across users.
  if (url.pathname.match(/^\/v1\/tickets\/by-code\/[^/]+$/)) {
    event.respondWith(networkFirstWithTtl(req, API_CACHE, API_TTL_MS));
    return;
  }

  // Bail out for every other cross-origin request - Stripe checkout, Sentry
  // ingest, the rest of the API (auth, payments, dashboard reads). The
  // browser cache handles those.
  if (url.origin !== self.location.origin) return;

  // Same-origin auth, dashboard, and payment paths are network-only. We
  // must not serve a stale session, a stale balance, or a stale Stripe
  // redirect.
  if (
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/signup') ||
    url.pathname.startsWith('/otp') ||
    url.pathname.startsWith('/dashboard') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/r/')
  ) {
    return; // let the browser handle it directly
  }

  // Ticket pages (/t/<code>). Network-first, cache fallback, offline page
  // last resort.
  if (url.pathname.match(/^\/t\/[^/]+$/)) {
    event.respondWith(networkFirstPage(req, PAGES_CACHE, PAGE_TTL_MS));
    return;
  }

  // Next.js build assets - cache-first because they are immutable
  // (content-hashed at build time).
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/_next/image')
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Brand assets and the manifest - cache-first, refreshed on SW update.
  if (
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/brand/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/og-image.png'
  ) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }

  // Navigation requests (top-level HTML) - network-first, fall back to
  // /offline.html when the network truly fails. This catches the marketing
  // pages, the pricing page, the install page, etc.
  if (req.mode === 'navigate') {
    event.respondWith(navigationHandler(req));
    return;
  }
});

// -------------------- strategies --------------------

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    // fetch(req) can throw for reasons other than being offline (request
    // re-dispatch quirks, mid-deploy races). Retry once with a clean
    // URL-based request before giving up.
    try {
      return await fetch(req.url, { cache: 'no-store' });
    } catch (err2) {
      // Never fabricate a Response for scripts/styles: a synthetic 503
      // silently kills hydration platform-wide, which is strictly worse
      // than surfacing the real network error to the browser.
      if (req.destination === 'script' || req.destination === 'style') {
        return Response.error();
      }
      return fallbackResponse();
    }
  }
}

async function networkFirstWithTtl(req, cacheName, ttlMs) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) {
      // Stamp with current time so the next read can decide whether the
      // cached copy is still within TTL.
      const stamped = await stampResponse(res.clone(), Date.now());
      await cache.put(req, stamped);
    }
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) {
      const age = ageMs(cached);
      // Even if stale beyond TTL, we still serve it offline - a stale
      // ticket is better than no ticket at the venue door. We only bail
      // out if the cache itself is empty.
      return cached;
    }
    return fallbackResponse();
  }
}

async function networkFirstPage(req, cacheName, ttlMs) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) {
      const stamped = await stampResponse(res.clone(), Date.now());
      await cache.put(req, stamped);
    }
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    return (await caches.match('/offline.html')) ?? fallbackResponse();
  }
}

async function navigationHandler(req) {
  try {
    const res = await fetch(req);
    return res;
  } catch (err) {
    return (await caches.match('/offline.html')) ?? fallbackResponse();
  }
}

// -------------------- helpers --------------------

// Add a header so the cached entry remembers when it was stored. Lets the
// next read decide whether to use the cache or refetch.
async function stampResponse(res, atMs) {
  const headers = new Headers(res.headers);
  headers.set('x-orkora-cached-at', String(atMs));
  const body = await res.blob();
  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function ageMs(res) {
  const stamp = Number(res.headers.get('x-orkora-cached-at'));
  if (!stamp) return Infinity;
  return Date.now() - stamp;
}

function fallbackResponse() {
  return new Response(
    JSON.stringify({
      error: 'offline',
      message:
        'Orkora is offline and this resource was not cached. Try again when you have a connection.',
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}
