# Orkora security audit, end to end (2 August 2026)

Scope: full-platform code and configuration review of the NestJS API (`apps/api`) and
the Next.js web app (`apps/web`), covering authentication and sessions, authorization
and multi-tenancy, payments and webhooks, public/unauthenticated exposure, web and SSR
security, and input validation, injection, uploads, and configuration. This is a
white-box source review, not a live penetration test against production.

Two confirmed Critical findings collapse tenant isolation and should be fixed before any
further exposure. Both were verified directly against the code, not just reported.

## Severity counts

- Critical: 2
- High: 2
- Medium: 8
- Low: 13
- Informational: 6

---

## Critical

### C1. Cross-tenant access via the X-Organization-Id header (systemic BOLA)

- Location: `apps/api/src/common/guards/roles.guard.ts:56-60`, exploited against every
  `@Controller('organizations/:orgId/...')` route (events, orgs, registrations, payments,
  billing, campaigns, discounts, recordings, feedback, analytics, api-keys, preferences,
  invites).
- Detail: `RolesGuard` resolves the org it authorizes against from the
  `X-Organization-Id` header first, then the route param. Every controller, however, acts
  on the path param `:orgId` (for example `create(@Param('orgId') orgId) -> events.createForOrg(orgId, dto)`),
  and services trust that path param. The two identifiers are never required to match.
- Exploit: a legitimate member of their own org A sends
  `POST /v1/organizations/{VICTIM_B}/events` with header `X-Organization-Id: {A}`. The
  guard finds the attacker's membership in A and passes, while the controller creates,
  reads, updates, or deletes under B. This bypasses tenant isolation across the whole
  organizer surface for any authenticated member of any role at or above the route
  minimum.
- Fix: authorize against the same org the service uses. Prefer the route param; if a
  header is also present it must equal the param, otherwise reject. Do not fall back to a
  client header or body for the authorization subject. Have services scope to the
  guard-set `activeOrgId` rather than a separately supplied path param.

### C2. Public-API events controller has no org binding on either auth path

- Location: `apps/api/src/modules/events/public-api.controller.ts:26-57`; API-key guard
  `apps/api/src/modules/auth/strategies/api-key.guard.ts`.
- Detail: `@Controller('organizations/:orgId/public/events')` mounts only
  `JwtOrApiKeyGuard`, with no RolesGuard and no check that the caller belongs to `:orgId`.
  The JWT path only authenticates, so any logged-in user (including a plain attendee) can
  read any org's events. The API-key path sets the caller's org from the key but never
  compares it to `:orgId`, so a key minted for org A reads org B by changing the path. The
  handler calls `getForOrg`, which has no status filter, so cross-tenant draft and
  unpublished events plus full tier, session, and speaker detail leak. `list()` forwards
  `?status=draft`, letting a caller enumerate any org's drafts.
- Fix: for API keys, assert `resolvedOrgId === params.orgId`; for JWTs, mount RolesGuard
  with a minimum role (staff). Restrict this read surface to published events.

---

## High

### H1. Social login accepts any token when the client-ID env var is unset (fail open)

- Location: `apps/api/src/modules/auth/verifiers/social.ts` (Google `verify()`, Apple
  `verify()`); `apps/api/src/config/env.schema.ts` marks both
  `GOOGLE_OAUTH_CLIENT_ID` and `APPLE_OAUTH_CLIENT_ID` optional.
- Detail: the Google audience check runs only `if (expectedAudience)`; when the client ID
  is unset, the `aud` comparison is skipped and any valid Google-issued ID token (minted
  for any unrelated OAuth client) with a verified email is accepted. Apple passes an
  `undefined` audience to `jwtVerify`, which then performs no audience validation. Because
  the social login resolves the account purely by email, an attacker who obtains a
  Google or Apple token for their own app carrying a victim's verified email achieves full
  account takeover. Signature, issuer, and expiry are still checked.
- Fix: require the client IDs in production and fail closed if unset. Never treat
  "audience not configured" as "audience valid". Prefer local JWKS verification for
  Google, matching the Apple path.

### H2. Double refund on pending or concurrent refunds

- Location: `apps/api/src/modules/payments/payments.service.ts` `refundOrder()`.
- Detail: the only guard before calling the provider is `order.status !== 'paid'`.
  `refundInitiatedAt` is not checked, there is no idempotency key, and there is no row
  lock. When a refund returns pending (bank-backed), the order stays paid with only
  `refundInitiatedAt` set, so a second click or a concurrent request issues a second
  provider refund. Stripe partially self-protects against over-refund, but Paystack and
  Flutterwave can create a second refund, over-paying the customer.
- Fix: flip status and marker atomically before calling the provider
  (`updateMany where status='paid' and refundInitiatedAt is null`, check affected count),
  and pass a provider idempotency key or deterministic reference.

---

## Medium

### M1. Postmark webhook fails open when the token is unset

- Location: `apps/api/src/modules/campaigns/postmark-auth.guard.ts`; env
  `POSTMARK_WEBHOOK_TOKEN` optional.
- Detail: if the token is not configured, the guard admits all requests. A forger who
  knows the URL, a MessageID, and a recipient can inject bounce or spam-complaint events
  and poison the email suppression list, killing deliverability for legitimate contacts.
- Fix: fail closed in production when the token is unset.

### M2. Limited discount codes are burned by unpaid or abandoned orders

- Location: increment in `apps/api/src/modules/registrations/registrations.service.ts`
  (on pending order creation); no decrement in `payments.service.ts` `markOrderFailed()`
  or `releaseStaleHolds()`.
- Detail: `times_redeemed` is bumped when the pending order is created but never released
  when that order fails or expires. Anyone can exhaust a capped code by starting
  registrations they never pay for, blocking legitimate buyers.
- Fix: decrement the redemption and delete the redemption row when a discounted order
  fails or expires, or only count redemptions on paid.

### M3. OTP code written to error logs on send failure

- Location: `apps/api/src/modules/auth/otp.service.ts` (send-failure branch).
- Detail: on any email or SMS provider error the plaintext OTP is logged at error level,
  unconditionally, not only under the `LOG_OTP_TO_CONSOLE` break-glass flag. Error logs
  are typically shipped to Sentry or a log aggregator, so a live authentication secret can
  persist in third-party stores.
- Fix: never log the code outside the explicit debug flag. Log destination, purpose, and
  error only.

### M4. OTP purpose confusion allows a session from a non-login OTP

- Location: `apps/api/src/modules/auth/auth.controller.ts` `exchangeOtp()`,
  `otp.service.ts` `verify()`.
- Detail: `/auth/otp/exchange` verifies the code against the client-supplied purpose and
  then issues a full session, without requiring `purpose === 'login'`. A code minted for
  another flow (for example `payment_confirm`) can be redeemed for a full authenticated
  session.
- Fix: bind each OTP to its issued flow and allow only `login` at the exchange endpoint.

### M5. CSRF double-submit on /auth/refresh is bypassable via a urlencoded body

- Location: `apps/api/src/modules/auth/auth.controller.ts` `refresh()`.
- Detail: the refresh cookie is SameSite=None in production, so CSRF protection rests on
  the double-submit header. The check is skipped whenever a body token is present. The
  urlencoded body parser is enabled by default, so a cross-site simple-request form POST
  with `refreshToken=x` populates the body, skips the CSRF check, and rotates the victim's
  session using the victim's cookie. Impact is bounded (the attacker cannot read the
  rotated tokens due to CORS) but it defeats the documented invariant.
- Fix: enforce the CSRF header whenever the refresh cookie is present, or require JSON and
  disable the urlencoded parser, or gate the body-token path on the absence of the cookie.

### M6. Admin can remove an organization owner

- Location: `apps/api/src/modules/orgs/orgs.service.ts` `removeMember()`; controller
  `@Roles('owner','admin')`.
- Detail: `updateMemberRole` is correctly owner-only, but `removeMember` allows admin and
  never compares actor role to target role. An admin can delete an owner's membership
  whenever more than one owner exists. Reachable cross-tenant when combined with C1.
- Fix: forbid acting on a target whose role is at or above the actor's, or make member
  removal owner-only.

### M7. Settlement does not validate paid amount or currency

- Location: `apps/api/src/modules/payments/payments.service.ts` `settleOrder()` and the
  provider verify parsers.
- Detail: Paystack and Flutterwave verify by our order id as the reference and settle on a
  success status only; the amount and currency actually paid are never compared against
  the order. Not live-exploitable today because totals are server-authoritative, but it is
  the expected defense-in-depth control and protects against future changes.
- Fix: return the paid amount and currency from verification and reject settlement on
  mismatch.

### M8. Organizer-controlled URLs reach href and iframe sinks without scheme validation

- Location: `apps/web/app/(public)/o/[slug]/SocialsBar.tsx` (anchor),
  `apps/web/app/(public)/e/[code]/StoryBlocks.tsx` (playlist iframe, brandCollab anchor,
  location iframe).
- Detail: organizer-set social, collab, and embed URLs render into `href` and `iframe src`
  with no scheme allowlist. A `javascript:` URL would be stored XSS against public
  visitors. It is blocked today by the enforced CSP and the tight `frame-src` allowlist,
  so exploitation depends on the CSP never being downgraded (note `CSP_REPORT_ONLY=1`
  disables enforcement).
- Fix: validate these URLs against an http(s)-only allowlist at the sink and in the API
  DTOs (`@IsUrl` with an explicit protocol list). Do not rely on CSP as the only control.

---

## Low

- L1. Unauthenticated GET creates a chat channel row: `engagement.controller.ts`
  `GET /events/:eventId/engagement/chat` calls `getOrCreateEventChat`, writing a row with
  no event existence or status check and no per-route throttle. Validate the event and do
  not create on a read path.
- L2. Attendee full names are readable unauthenticated on the public engagement reads
  (chat, polls, questions). Internal ids are correctly withheld. Confirm this is intended;
  consider gating behind a valid ticket code.
- L3. Passwords hashed with argon2 defaults and no server-side pepper, while tokens and
  OTPs are peppered. Pin argon2id cost parameters and add a keyed pepper.
- L4. TenancyInterceptor and row-level security are dead code: the interceptor is never
  registered and no RLS policies exist, so isolation rests entirely on app-level filters.
  Either wire it as a real backstop (sourced from the verified active org) or remove it.
- L5. Unauthenticated order endpoints keyed only by order id (`payments.controller.ts`
  `getOrder`, `verifyOrder`); `verify` is unthrottled and triggers an outbound provider
  call. UUIDs make enumeration impractical, but add throttling and consider a signed
  confirmation token.
- L6. No per-user discount redemption cap (`DiscountRedemption` unique only on orderId).
  Add a per-user constraint if one-per-customer is intended.
- L7. Fixed-amount discount with null currency applies to any currency. Require a currency
  for fixed codes.
- L8. Public feedback can be attributed to an arbitrary real user by unverified email
  (`feedback.service.ts` `submitPublic`). Leave `userId` null unless the submitter is
  authenticated.
- L9. Story-analytics ingest array is unbounded at the DTO layer (service caps at 50). Add
  `@ArrayMaxSize(50)` on `StoryAnalyticsBatchDto.events`.
- L10. Login user lookup is case-sensitive while the lockout ledger is lowercased
  (`auth.service.ts`). Normalize the lookup to lowercase. Fails closed, so consistency only.
- L11. Google ID token is placed in a request URL query string to the tokeninfo endpoint.
  Verify locally against JWKS instead.
- L12. Web CSP uses `style-src 'unsafe-inline'`; `img-src`, `media-src`, and `connect-src`
  include broad wildcards (`*.amazonaws.com`, `*.r2.dev`). Narrow to the specific
  bucket or CDN host, and move toward nonce-based styles.
- L13. Real secrets live in the on-disk `apps/api/.env` (git-ignored, confirmed not
  committed): JWT private key, refresh pepper, ticket-signing secret, Stripe test keys.
  Rotate and ensure production injects distinct secrets via the platform env, never a
  checked-out file. Confirm no historical commit ever contained a `.env`.

## Informational

- I1. Issued JWTs carry no `aud` claim and no audience is validated. Acceptable for a
  single audience; adding one is cheap hardening.
- I2. OTP hash comparison uses `===` rather than a constant-time compare. Not exploitable
  (comparing hashes of attacker input) but inconsistent with the rest of the codebase.
- I3. Stripe `checkout.session.completed` is treated as paid without checking
  `payment_status`. Safe for card-only today; gate on `payment_status === 'paid'` if
  delayed methods are added.
- I4. Webhook side effects run after the idempotency-ledger insert commits, outside a
  shared transaction. Well mitigated by verify-on-return and reconciliation; optionally
  do both in one transaction.
- I5. Gated recordings fall back to the public media bucket when
  `S3_BUCKET_RECORDINGS` is unset. Set the private bucket in production.
- I6. `next.config.mjs` sets `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds`
  to true. Re-enable once the backlog clears, and keep CI typecheck and lint blocking.
- I7. Billing CSV renders the human total with a hardcoded divide-by-100, wrong for
  zero-decimal and three-decimal currencies. Cosmetic; use the money helpers.

---

## Verified as correct (no action)

- JWT algorithm is RS256, enforced on sign and verify; no alg confusion. Expiry and issuer
  are validated; kid rotation is sound because the algorithm set is locked.
- Refresh tokens: 48-byte CSPRNG, stored only as a peppered SHA-256, rotated on every use,
  with reuse detection that revokes the whole token family, and logout revokes all tokens.
- Refresh and CSRF cookies: httpOnly and Secure in production, SameSite=None with a
  domain scope, path-scoped, with a non-httpOnly CSRF companion used in a constant-time
  compare. Client keeps the access token in sessionStorage and never exposes the refresh
  token to JS.
- Signup is non-enumerating and pays the hash cost on every path. Login has per-email
  exponential-backoff lockout plus a global per-IP throttle. OTP has CSPRNG codes, expiry,
  attempt caps, resend cooldown, per-destination hourly cap, and single-use consumption.
- Throttling is actually wired (global APP_GUARD plus per-route `@Throttle`).
- Payments: order totals are server-authoritative (the client never supplies a price);
  webhook signatures are verified and fail closed for all providers; the
  `webhook_events` unique constraint plus idempotent state transitions prevent
  double-settle and double-void; refunds are authorized, org-scoped, and cannot touch
  unpaid orders; money math is integer and BigInt end to end with correct minor-unit
  handling; reconciliation jobs re-verify against the provider.
- Public surface: email masking is intact on the ticket lookup, share payload omits the
  QR token, event and ticket codes are crypto-random and not enumerable, and every public
  read gates on published and non-suspended status. OG image routes and the sitemap fetch
  only the fixed internal API host with encoded path segments (no SSRF), and render text
  only (no reflected HTML).
- Web: no `dangerouslySetInnerHTML` anywhere; the email markdown renderer escapes and
  allowlists URL schemes; CSP is a real nonce plus strict-dynamic policy with
  `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`; open-redirect guard is
  correct; no server secret is imported into the client bundle.
- Input: global ValidationPipe uses whitelist, forbidNonWhitelisted, and
  forbidUnknownValues, blocking mass assignment of privileged fields; all raw SQL is
  parameterized; uploads allowlist image and video types (SVG and HTML excluded), derive
  keys server-side, and cap size; the server-side fetch helper blocks private and reserved
  address ranges (SSRF-safe); CORS is an explicit allowlist with no wildcard-plus-
  credentials; env schema fails closed on missing secrets; CI runs dependency, secret,
  and bundle-leak scans plus authorization abuse tests.

## Prior art

This builds on the existing security program (harness, `SECURITY_AUDIT.md`,
`SECURITY_REVIEW.md`, the 2026-05-30 OWASP pass, and the July public-API exposure audit).
The two Critical tenancy findings are new and are the priority. The email-masking fixes
from the earlier public-API audit were confirmed still in place.

## Recommended remediation order

1. C1 and C2 (tenant isolation) before any further exposure.
2. H1 (social-login fail-open) and H2 (double refund).
3. M1 (Postmark fail-open), M2 (discount slot exhaustion), M3 (OTP in logs), M4 (OTP
   purpose), M5 (CSRF bypass), M6 (admin removes owner).
4. The Low and Informational items as hardening, plus a secret rotation for L13.

Add regression tests for C1 and C2 (an abuse test proving org A cannot reach org B via the
header or the public API) to the existing authorization abuse-test suite.
