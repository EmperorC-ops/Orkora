# Security review

This is the going-in security posture for the current build (Phases 1-7 + polish).
It records what is already in place, what was tightened in this pass, and the
residual risks that need attention before a public launch with real money flowing.

## What is already in place

### Authentication
- **Argon2id** for password hashing (`@node-rs/argon2` -> `argon2` package).
  No custom KDF.
- **RS256 JWTs** signed with a 2048-bit RSA private key kept out of git and
  pasted into the deploy environment as a secret. Public key only on the API.
- **Refresh tokens** are 48 random bytes (base64url), hashed with SHA-256 + a
  per-deployment pepper before insert. The plain refresh token is never stored.
- **Refresh rotation**: every `/auth/refresh` revokes the presented token and
  issues a new pair. Replay of a revoked refresh token returns 401 and
  invalidates the lineage.
- **Logout** sets `revokedAt` on every active refresh token for the user.
- **OTP-based magic-link** (`/auth/otp/exchange`) trusts the OTP service to
  have just verified the destination, then issues tokens. OTPs use a short TTL
  and are single-use, enforced by the OTP service.
- **Social sign-in** verifies Google ID tokens via the official tokeninfo
  endpoint (audience + issuer). Apple verification currently decodes the JWT
  payload and relies on upstream client integrity; full JWK signature
  verification is the documented next step.

### Authorization
- **`AuthGuard('jwt')`** on every protected controller, sourced from
  `@nestjs/passport`.
- **`RolesGuard`** for organization-scoped endpoints. Resolves the active org
  from the route param or `X-Organization-Id` header, looks up the user's
  membership, compares against a `@Roles(...)` decorator. Hierarchy is
  `owner > admin > organizer > staff > vendor > attendee`.
- **Tenancy** is enforced inside services as well as the guard: every read or
  write that takes an `orgId` cross-checks the resource (event id, registration
  id) belongs to that org.

### Transport and CORS
- **CORS allowlist** sourced from `CORS_ORIGINS` env. Defaults to localhost in
  dev. Wildcards intentionally not supported.
- **CSP** locked down to `default-src 'self'` plus inline-style for
  Swagger / form rendering.
- **HSTS** with `max-age=1y; includeSubDomains; preload` in production only.
- **Helmet** otherwise on its tight defaults.
- **Rate limits**: `@nestjs/throttler` global limit of 300 requests / minute.
  Tighter per-route limits on auth (5 OTP sends/min), public registration
  (10/min), and uploads (30/min).

### Webhooks
- **Stripe**: signature verified via `stripe.webhooks.constructEvent`, which is
  the library's constant-time HMAC check.
- **Paystack**: HMAC-SHA512 of raw body using the API secret key, compared
  with `timingSafeEqual`.
- **Flutterwave**: static `verif-hash` header compared in constant time against
  the secret hash configured in the dashboard.
- **Raw body capture** is enabled at the Nest factory (`rawBody: true`) so
  signature checks read the unparsed payload.
- **Order state machine** is idempotent: a `paid` order ignores subsequent
  `paid` events; a `failed` order ignores duplicates; refunds are explicit.

### Data
- **Postgres** with the canonical schema in `schema.sql`. New columns ship as
  numbered SQL files in `/migrations`.
- **Soft-delete** on messages (`deleted_at`); polls and tickets use status
  fields rather than physical delete to preserve audit trail.
- **BigInt** money fields end-to-end. Conversion to Number only at JSON
  boundaries when the value fits in `Number.MAX_SAFE_INTEGER`.
- **Ticket QR** is HMAC-SHA256 signed with `TICKET_SIGNING_SECRET`. Scanner
  rejects bad signatures and expired payloads before any DB lookup.
- **Capacity holds** use `SELECT ... FOR UPDATE` inside a transaction, so two
  concurrent registrants for the last seat are serialised by Postgres.
- **Stale-hold cron** releases pending orders past `ORDER_HOLD_TTL_MIN` so the
  inventory never leaks even when a webhook is missed.

### Input validation
- **`class-validator` + `ValidationPipe`** with `whitelist`,
  `forbidNonWhitelisted`, and `forbidUnknownValues`. Any field not in the DTO
  is rejected; any payload that does not match a class is rejected.
- **Type coercion** on path / query params (`@nestjs/common`'s
  `enableImplicitConversion`).
- **Email normalisation** (`citext` column + `.toLowerCase()` in service) so
  user lookups are case-insensitive without per-query work.

### Operational
- **Helmet, throttler, validation pipe** are global; new modules inherit
  them automatically.
- **All secrets** are env-only. None are committed.
- **Health endpoint** at `/health` for the load balancer.
- **Structured logs** via pino with redaction on `authorization`, `cookie`,
  `password`, and `token` field paths.

## Tightened in this pass

- **CSP directives** explicitly set: `default-src 'self'`, `frame-ancestors
  'none'`, `object-src 'none'`. The API is JSON-only so a strict CSP is the
  right default.
- **HSTS** turned on in production with preload-eligible parameters.
- **`Referrer-Policy: strict-origin-when-cross-origin`** applied API-side too
  (was already on the web app).
- **`Cross-Origin-Resource-Policy: cross-origin`** so legitimate cross-origin
  reads continue to work without exposing details.
- **Validation pipe** now sets `forbidUnknownValues: true`, so a payload that
  fails to match a registered DTO class is rejected with 400 instead of being
  silently accepted as `{}`.

## Residual risks

These are known and accepted for this release; each is a discrete follow-up
with the rough scope.

### High priority

1. **Refresh tokens live in `sessionStorage`** on the web client. XSS in any
   first-party JS would let an attacker steal them. Mitigations: tight CSP, no
   third-party scripts. Long-term fix: move refresh to an `httpOnly` cookie
   set by the API on `/auth/login`, with `SameSite=Strict` for the dashboard
   origin and a separate cookie domain for cross-app reuse. Estimated effort:
   one slice (~half a day).

2. **Apple sign-in does not verify the ID token signature.** Today we decode
   the JWT and trust the client's freshness. A determined attacker who can
   forge an Apple-shaped JWT could sign in. Fix: pull Apple's JWK set,
   verify with `jose`. Estimated effort: half a slice.

3. **Webhook idempotency is order-state-based, not event-id-based.** If
   Stripe / Paystack / Flutterwave deliver the same event twice in quick
   succession (within ~50ms before the order state has flipped), both runs
   could try to issue tickets / send confirmation. The order's unique
   constraints save us from double-issue but the email could go twice. Fix:
   add a `webhook_events(provider, provider_event_id)` table with a unique
   index, insert before processing, skip on conflict. Estimated effort: one
   small slice.

### Medium priority

4. **No audit log table.** Sensitive actions (role changes, refunds,
   deletions, ticket cancellations) leave only application logs. Add a
   `audit_events` table with `(actor_id, action, resource_type, resource_id,
   metadata, occurred_at)` and an interceptor that fires it for designated
   handlers. Estimated effort: one slice.

5. **Password complexity is min-8-chars only.** No upper / digit / symbol
   requirement, no breach-list check. Add `zxcvbn` or use Have I Been Pwned's
   k-anonymity API. Estimated effort: small.

6. **No CSRF protection on web -> API requests** because the dashboard sends
   bearer tokens, not cookies. If we ever move refresh to httpOnly cookies
   (item 1), CSRF protection becomes mandatory. Plan in the same slice.

7. **Public ticket lookup by code** is reachable without auth so the QR-code
   email is shareable. Codes are 10 chars from a 31-char alphabet so the
   namespace is ~8 * 10^14, more than enough to defeat enumeration, but a
   future hardening could require an OTP for any first-party ticket display
   beyond the simple "did you register" surface.

### Low priority / informational

8. **Stripe API version pin** at `2024-04-10` will drift as Stripe rolls new
   versions. Bump and test quarterly.

9. **No request-id middleware**. Pino auto-correlates per-process but a
   per-request id (UUID) attached to the response header makes user-reported
   bugs easier to trace. ~10 lines of middleware.

10. **No structured rate-limit per user** (only per IP). Co-located teams
    behind the same NAT can share a rate-limit bucket. Add a per-user
    throttler key for authenticated routes after we move to the cookie-based
    refresh path. Estimated effort: small.

11. **Image upload size cap is enforced client-side** (8 MB). The S3 presigned
    URL imposes the same cap via the bucket's CORS policy in production; verify
    the R2 bucket CORS rule sets `MaxObjectSize` after deploy.

12. **No CSP report-uri**. Add a Sentry endpoint or a small log-only handler
    to capture CSP violations from the web app once it is in front of users.

## Production launch checklist

Before turning real card flow on in front of real users:

- [ ] Move refresh tokens to httpOnly cookies (item 1)
- [ ] Add webhook event-id ledger (item 3)
- [ ] Apple JWK signature verification (item 2)
- [ ] Audit log table + interceptor (item 4)
- [ ] Rotate all dev secrets (`JWT_*`, `REFRESH_TOKEN_PEPPER`,
      `TICKET_SIGNING_SECRET`) at production deploy time
- [ ] Confirm `BOOTSTRAP_SCHEMA=false` after first deploy
- [ ] Confirm `SEED_ON_BOOT=false` so the demo user is not in production
- [ ] Confirm `NODE_ENV=production` so Swagger is gated and HSTS is on
- [ ] Verify CORS allowlist contains only the production origins
- [ ] Hook Sentry: set `SENTRY_DSN` on both API and web
- [ ] Run a payment smoke test in each provider's test mode against the
      production hostname before flipping to live keys
