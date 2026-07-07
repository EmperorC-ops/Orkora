# Security Fix + E2E Verification — 2026-07-07

## Reported issue

Email and password visible in the browser address bar during login on orkora.events.

## Root cause

`apps/web/app/(auth)/login/page.tsx` (and signup) rendered `<form onSubmit={...}>` with no `method` attribute. The React handler calls `preventDefault()` and POSTs via JSON, but any native submit (Enter pressed before hydration completes, or a JS/hydration error) falls back to the HTML default: GET to the current URL, serializing `email` and `password` into the query string. From there the credentials land in browser history, Vercel/edge access logs, pino request logs (`req.url` is logged; only body fields are redacted), and outgoing Referer headers.

## Fixes applied (uncommitted, in working tree)

1. `apps/web/app/(auth)/login/page.tsx` — `method="post"` on the form; `next` redirect param sanitized via `safeInternalPath` (both password and magic-link paths).
2. `apps/web/app/(auth)/signup/page.tsx` — `method="post"` on the form; stale comment about in-URL credential fallback corrected.
3. `apps/web/app/(auth)/otp/page.tsx` — deleted the dead `params.get('password'|'fullName'|'phone')` fallback (signup details now come exclusively from the sessionStorage stash, with a graceful "start again" path if the stash is missing); `next` sanitized.
4. `apps/web/lib/auth.ts` — new `safeInternalPath()` blocks open redirects (`/login?next=https://evil.com`, `//evil.com`, backslash tricks).
5. `apps/mobile/app/(auth)/signup.tsx`, `otp.tsx`, new `apps/mobile/src/auth/pending-signup.ts` — password no longer passed through expo-router navigation params (parity with the web fix); held in memory for the signup→OTP flow only.
6. `apps/api/src/common/http/secure-fetch.ts` — SSRF guard now strips brackets from IPv6 literal hostnames so `https://[::1]/` is rejected as `private-address` instead of falling through to a DNS error (fixes the one genuinely failing unit test).

## Verification (Linux sandbox, fresh install)

| Check | Result |
|---|---|
| Install (pnpm, 1968 packages, native rebuilds) | PASS |
| Typecheck, all 9 workspace tasks incl. web + mobile | PASS (api skipped-for-infra, see below) |
| Lint (7 packages) | PASS (style warnings only) |
| API unit tests | 84/84 tests pass; 11/26 suites run |
| Web production build (`next build`) | PASS |
| E2E smoke: served production build, all core routes | 200 on `/`, `/login`, `/signup`, `/otp`, `/pricing`, `/contact` |
| E2E fix assertion: server-rendered HTML | `<form class="space-y-4" method="post">` on /login and /signup |
| Open-redirect sanitizer logic | 7/7 cases pass |
| secure-fetch SSRF suite | 4/4 pass, incl. IPv6 loopback |

Sandbox-blocked (not code defects): `prisma generate` (binaries.prisma.sh returns 403 through the sandbox proxy) blocks 15 API test suites and any live-API e2e; `fonts.googleapis.com` blocked (build verified with Next's font-mock env var). API typecheck failures are entirely cascades of the ungenerated Prisma client. Re-run `pnpm -r typecheck && pnpm -r test` in CI or locally where those hosts are reachable for full coverage.

## Client-readiness verdict

NOT ready until this fix is deployed. Production (orkora.events) still serves the vulnerable form. Required before client use:

1. Commit and deploy the web app fix (items 1-4). This is the blocker.
2. Treat any password entered on the login page to date as potentially logged: it may exist in Vercel/edge access logs and browser histories. Rotate internal/test account passwords; scrub or expire access logs containing `/login?` with query strings; consider forcing a reset for any real early users.
3. Ship the mobile fix (item 5) with the next app release; API fix (item 6) with the next API deploy.
4. Run the full API suite in CI (Prisma reachable) before the deploy.

## Residual, non-blocking

- Email address (PII, not a credential) travels in the `/otp?destination=` query string. Acceptable; move to the sessionStorage stash if zero-PII URLs are wanted.
- `next.config.mjs` warning: `outputFileTracingIncludes` unrecognized by Next 14.2.3.
