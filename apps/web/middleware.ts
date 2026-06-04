import { NextResponse, type NextRequest } from 'next/server';

/**
 * Per-request CSP nonce + enforced Content-Security-Policy.
 *
 * Why a middleware?
 *
 *   Next.js App Router emits inline `<script>` tags for client-side
 *   hydration (the React Server Component payload and the router
 *   bootstrap). With a strict `script-src 'self'` policy those inline
 *   scripts would be blocked. The supported pattern is to generate a
 *   per-request nonce in middleware, pass it through the `x-nonce`
 *   request header, and emit `script-src 'self' 'nonce-<value>'` in the
 *   Content-Security-Policy. Next then automatically picks up the header
 *   and stamps the nonce onto its inline scripts.
 *
 *   The middleware also flips the policy from `Report-Only` to enforced.
 *   The previous header lived in next.config.mjs as
 *   `Content-Security-Policy-Report-Only` so we could shake out violations
 *   in production before tightening. Reports were quiet for a week and the
 *   inline-script need is now nonced, so we cut the report-only escape and
 *   ship the enforced policy.
 *
 * Why is `report-uri` still present?
 *
 *   It costs nothing and gives us forward visibility if a new third-party
 *   library or an inline-style on a future page violates. The API receives
 *   reports at `/v1/csp-reports` and forwards them to Sentry.
 *
 * Notes on `strict-dynamic`:
 *
 *   We use `strict-dynamic` alongside the nonce so that scripts injected
 *   by an already-trusted (nonced) script (e.g. webpack chunks loaded via
 *   document.createElement('script') in Next's runtime) are also trusted.
 *   Without `strict-dynamic` we would have to nonce every chunk URL, which
 *   the App Router does not do today.
 *
 * Operator notes:
 *
 *   To temporarily revert to Report-Only (e.g. while shipping a risky
 *   change that may trip CSP), set the env var `CSP_REPORT_ONLY=1` on the
 *   web deploy. The middleware swaps the header name back to
 *   Content-Security-Policy-Report-Only and emits a warning header so
 *   monitoring can detect the temporary downgrade.
 */

const REPORT_ONLY_FLAG = 'CSP_REPORT_ONLY';
const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const apiWsOrigin = apiOrigin.replace(/^http/, 'ws');

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Style still needs 'unsafe-inline' because Tailwind-emitted style tags
    // in dev and some third-party components (notably react-day-picker)
    // inject inline styles without nonces. Style injection is a lower-risk
    // vector than script injection.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.r2.dev https://*.r2.cloudflarestorage.com https://*.amazonaws.com https://cdn.orkora.events",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin} ${apiWsOrigin}`,
    `report-uri ${apiOrigin}/v1/csp-reports`,
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  // Hand the nonce to the rendering layer via request header. Next reads
  // this and stamps it onto its inline bootstrap scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const reportOnly = process.env[REPORT_ONLY_FLAG] === '1';
  if (reportOnly) {
    response.headers.set('Content-Security-Policy-Report-Only', csp);
    response.headers.set(
      'X-Orkora-Csp-Mode',
      'report-only (CSP_REPORT_ONLY=1 — remove to re-enforce)',
    );
  } else {
    response.headers.set('Content-Security-Policy', csp);
  }

  return response;
}

/**
 * Match every route except the asset paths and the API report endpoint.
 * Excluding _next/static / _next/image keeps the per-request nonce off
 * cacheable artifacts.
 */
export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
