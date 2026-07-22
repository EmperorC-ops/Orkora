# Path to Production

The single living document that answers "where are we, and what's left
to ship?" Refreshed 2026-06-29.

This is the operator's view. For deeper detail, follow the cross-references
to `OUTSTANDING.md`, `LAUNCH_CHECKLIST.md`, `LAUNCH_READINESS.md`,
`LAUNCH_RUNBOOKS.md`, `SECURITY_REVIEW_2026-05-30.md`,
`LEGAL_REVIEW_PACKET.md`, `THREAT_MODEL.md`, and `DOMAIN_AUTH_FOR_ORGS.md`.

## What we mean by "production"

There are two launch milestones, and they have different gates.

1. **Private beta** — invite-only, 5 to 10 hand-picked organizers, real
   money flowing, soft launch with no marketing. The gate is: "could
   something go irreversibly wrong if a real organizer touches it?" If
   the answer is no, that item is private-beta-ready.

2. **Public launch** — open signup, marketing on, payments at any scale,
   any organizer can self-serve. The gate is: "would a regulator,
   journalist, or upset customer expose us if they looked?" Legal
   review, DPO appointment, DMARC enforcement, and full DPA artefacts
   are public-launch gates.

Today we are at private-beta readiness, modulo two operator decisions
(legal entity registration and counsel sign-off) that are not code.

## Snapshot

- **Shipped:** ~170 distinct tracked items across foundations, payments,
  events, tickets, engagement, super-admin, security, brand, and docs.
- **Open before private beta:** 2 (both non-code; you-driven).
- **Open before public launch:** 6 (3 non-code, 3 code/ops).
- **Post-launch backlog:** ~15 (none blocking).

## A. Done

### Foundations and infra
- [x] Pnpm monorepo, NestJS API on Render (Frankfurt, always-on starter), Next.js 14 web on Vercel.
- [x] Neon Postgres on Launch plan (PITR retention, no compute cap).
- [x] Staging stack fully isolated: `staging.orkora.events`, `staging-api.orkora.events`, separate Neon project, Render `orkora-api-staging`, auto-deploys from `staging` branch.
- [x] Forward-only SQL migration runner (`scripts/migrate.mjs`); `prisma db push` removed from all CI/runbook paths.
- [x] Backup + restore drill executed against staging; RPO/RTO recorded.
- [x] Sentry on API + web with `RENDER_GIT_COMMIT` release tagging + source-map upload.
- [x] UptimeRobot monitor on `/health/ready` (5-min cadence) with alert delivery verified.
- [x] CSP report endpoint (`POST /v1/csp-reports`) wired through helmet into Sentry.
- [x] Structured logs via `nestjs-pino` + request-id middleware.
- [x] Sentry alert drill runbook in `LAUNCH_RUNBOOKS.md` §R-9.
- [x] PWA service worker with VERSION-based cache invalidation + brand precache + offline fallback.

### Auth and authorization
- [x] Email/password signup + OTP verification + magic-link OTP login.
- [x] Apple sign-in with JWK signature verification.
- [x] Argon2id password hashing with server pepper.
- [x] JWT RS256 with `kid`-based key rotation overlap (`JWT_PUBLIC_KEY_PREVIOUS`).
- [x] Refresh tokens: httpOnly cookie, rotation-on-use, reuse detection (revokes whole family), peppered hashes.
- [x] CSRF on `/v1/auth/refresh` (double-submit cookie + header, constant-time compare). Mobile body-token path exempt.
- [x] Per-account brute-force defence (exponential backoff).
- [x] OTP: 30s cooldown, hourly per-destination send cap, per-code attempt lockout.
- [x] Signup non-enumeration: always returns 202; verified accounts get a notice email, unverified get OTP resent. Constant-time response via always-pay-argon2.
- [x] Per-user rate limiting (UserThrottlerGuard); per-route tunings on OTP, login, signup, refresh, checkout, uploads, public API.
- [x] CORS locked to trimmed allow-list via `CORS_ORIGINS`.
- [x] Web CSP in enforce mode (per-request nonce via `apps/web/middleware.ts`); `CSP_REPORT_ONLY=1` rollback available.

### Tenancy and RBAC
- [x] Roles: owner, admin, organizer, staff, vendor. Platform roles: none, support, superadmin.
- [x] `RolesGuard` with superadmin bypass at one named site (`apps/api/src/common/guards/roles.guard.ts:70`).
- [x] Tenancy isolation audit + automated cross-org tests (BOLA/IDOR + role escalation).
- [x] Websocket gateway tenancy review (#99).
- [x] `$queryRawUnsafe` audit; one string-interpolation site found and fixed (SECURITY_REVIEW §1.1).

### Payments and refunds
- [x] Three providers wired: Stripe (USD), Paystack (NGN), Flutterwave (XAF/XOF, code only — keys not yet set).
- [x] Verify-on-return settlement parity across all three (settleOrder) + signature-verified webhooks + idempotency ledger.
- [x] Refunds: organizer-initiated, three-path settlement (verify-on-action + webhook + reconciliation cron).
- [x] Ticket lifecycle bug fixed: tickets are now allocated on payment, not registration; voided on refund.
- [x] Duplicate-Stripe-checkout-session bug fixed.
- [x] Per-(org, currency) payment-provider preferences.
- [x] Reconciliation cron (live; clean ticks visible in logs).
- [x] Per-paid-order receipt emails (paid confirmation + refund confirmation).
- [x] Currency/minor-unit correctness across all currency × provider combos with unit tests.

### Events, tickets, engagement
- [x] Events / tiers / sessions / tracks / speakers / live-stream URL.
- [x] Public event homes with timezone-aware display.
- [x] Registration + QR tickets (HMAC-signed) + check-in.
- [x] Org dashboard: events, registrations, attendees, analytics, settings, members, branding, API keys.
- [x] Live chat / polls / Q&A via socket.io gateway; engagement audit logged.
- [x] Delegate process flow (sessions + comments) documented end to end in `DELEGATE_FLOW.md`.
- [x] Campaigns module Slice A: composer, test-send, broadcast, Postmark batch send, webhook for delivered/bounced/opened/clicked/complained, HMAC-signed one-click unsubscribe (CAN-SPAM).

### Super-admin platform console
- [x] Schema: `platformRole` on `User`, `status` on `Organization` + migration.
- [x] JWT claim + `PlatformGuard` + `RolesGuard` bypass.
- [x] Admin API: orgs, users, events, metrics, suspend/promote endpoints.
- [x] `/admin` UI: overview tiles + organizations + users + events.
- [x] Bootstrap seed script (`pnpm seed:superadmin`) idempotent + documented.
- [x] `command@givara.dev` provisioned as superadmin on prod + staging.

### Brand and marketing
- [x] D-prime brand identity: SVG mark (rounded plate + white ring + upward triangle) + live-text wordmark + tagline.
- [x] Brand component is the single canonical renderer; scales off `h-N` className; tagline shows above 56px.
- [x] PNG raster ladder generated from the SVG via sharp for browsers that need it.
- [x] Favicon + maskable icons + PWA manifest + OG image + Twitter card all updated.
- [x] Auth-page logo sizes corrected (this session): login + signup `h-12`, OTP centered `h-20`.
- [x] One-pager (md + printable HTML + PDF) explaining the platform.

### Security review
- [x] OWASP Top-10 review pass shipped 2026-05-30 with two same-day fixes (SECURITY_REVIEW §10).
- [x] 2026-06-29 follow-ups: A04 threat model (`THREAT_MODEL.md`), A09 Sentry alert drill (`LAUNCH_RUNBOOKS.md` §R-9), A10 SSRF re-audit + `SecureFetch` helper (`apps/api/src/common/http/secure-fetch.ts`).
- [x] Security harness: `pnpm security:all` runs dep CVE audit, secrets scan (TruffleHog + GitGuardian), bundle-leak scan, transport posture, BOLA/IDOR + role-escalation tests, OWASP ZAP baseline; runs in CI on every push/PR.
- [x] Pre-public-launch follow-ups (#109): CSRF on refresh, JWT key rotation overlap, signup non-enumeration, weekly CVE scan, CSP enforce flip, upload size cap.

### Legal and compliance scaffolding
- [x] Four legal drafts written and assembled into `LEGAL_REVIEW_BINDER.pdf` (137KB single binder) ready for counsel.
- [x] All previously-TBD placeholders filled with applied defaults (entity = Orkora Technologies Limited, jurisdiction = Federal Republic of Nigeria, venue = Lagos State, DPO = `dpo@orkora.events`, retention = 6 years, etc.). See `LEGAL_REVIEW_PACKET.md` §8.
- [x] PCI posture: provider-hosted checkout only (SAQ-A); documented in privacy policy.
- [x] Per-org domain authentication runbook for organizers in `DOMAIN_AUTH_FOR_ORGS.md`.

### CI and developer ergonomics
- [x] GitHub Actions: build + lint + typecheck + Jest + weekly CVE scan.
- [x] Migration runner integrated into Dockerfile + entrypoint.
- [x] Secrets rotation script `scripts/rotate-secrets.sh`.

## B. Outstanding before Private Beta

These are the only items I would not ship without. Both are operator
decisions, not code.

1. **Legal entity registration** — Orkora Technologies Limited needs to be
   formally registered. The drafts already use this name as a default;
   counsel sign-off cannot complete until the registration number and
   registered address are real. Without the registration we cannot
   accept payments through a corporate banking relationship.
2. **Counsel sign-off on `LEGAL_REVIEW_BINDER.pdf`** — engage Nigerian
   counsel, get the binder back marked up, apply the redlines, remove
   the "DRAFT FOR COUNSEL REVIEW" banner, and wire the cleaned text
   into the four `apps/web/app/legal/*/page.tsx` stubs.

Everything else needed for private beta is shipped, tested, and
documented. Once these two land, you can hand-onboard the first
organizers using `TESTER_GUIDE.{md,pdf,docx}` and start taking real
money.

## C. Outstanding before Public Launch

These can be deferred during a private beta but must close before open
signup with marketing on.

### Code and ops
3. **Operator provisions two staging test accounts** — the api-authz
   abuse tests need persistent test users on staging to run in CI
   nightly rather than ephemerally per-run. Documented in
   `SECURITY_AUDIT.md` "Provisioning the test accounts". One session.
4. **First Sentry alert drill** — per `LAUNCH_RUNBOOKS.md` §R-9: force
   a synthetic error in prod via `?_sentry_drill=1`, confirm the alert
   actually pages, record the time-to-page. Runbook is written; the
   drill itself has not yet been run.
5. **Repo-wide ESLint config** (#63) — currently only `apps/api/` lints
   strictly. Web has a looser config. Standardise so CI gates web and
   contracts the same way. One session.

### Non-code (operator)
6. **DPO appointed** — named individual or contracted DPO-as-a-service.
   Best-case default in effect today: `dpo@orkora.events` routes to
   the founder and is referenced from Privacy Policy §13. Appoint a
   named DPO (or a contracted DPO-as-a-Service provider like DPO
   Advisor or Prosperoware) before public launch and update the
   privacy policy with the named individual.
7. **Insurance bound** — recommended posture in `LEGAL_REVIEW_PACKET.md`
   §8: US$1M general liability + US$1M cyber + US$1M E&O. Hiscox or
   Embroker for SMB SaaS. The liability cap clause references "the
   greater of US$1,000 or trailing-12-month fees" but real insurance
   coverage is the actual mitigation.
8. **Postmark sending-domain DMARC moved from p=none to p=quarantine**
   — DMARC is published at `p=none` for observation. Once two weeks of
   clean DMARC reports land in `dmarc@orkora.events`, move to
   `p=quarantine`. DNS-only change; documented in
   `LAUNCH_RUNBOOKS.md` §6.2.

### Operational best-case posture (in effect now)

While the four public-launch items above close, the platform ships
today with the following defaults live and documented:

| Item | Best-case default in effect |
|---|---|
| DPO contact | `dpo@orkora.events` (forwards to founder mailbox) |
| Security disclosures | `security@orkora.events` |
| Trust and safety | `abuse@orkora.events` (forwards to `security@`) |
| Privacy requests | `privacy@orkora.events` |
| DMARC policy | `p=none` with aggregate reports to `dmarc@orkora.events`; monitoring 14-day window before moving to `p=quarantine` |
| Legal entity | Orkora Technologies Limited (registration in progress; drafts carry `RC [to be filled...]` placeholder that will render as-is on the live pages until updated) |
| Insurance | Recommendation adopted (Hiscox / Embroker SMB SaaS US$1M cyber + US$1M E&O + US$1M GL); binding scheduled once entity registration closes |
| Legal pages | Best-case counsel-marked drafts live at `/legal/{terms,privacy,refunds,organizer}` with `[COUNSEL NOTE]` markers stripped from the rendered output; source retains them at `LEGAL/*.md` for the counsel round |
| Campaigns webhook | Basic-Auth guarded via `POSTMARK_WEBHOOK_TOKEN` (backwards-compat admits when unset) |
| Campaigns daily cap | Enforced per-org rolling 24 h: `CAMPAIGNS_DAILY_CAP_PER_ORG` env, default 1000 |

## D. Operational decisions only you can make

Not blockers, but they shape the launch shape:

- **Reclaim crest-federal slug** (#42) — cosmetic; current placeholder
  is fine. Decide if you want it reclaimed before announcement.
- **Stripe live keys for additional currencies** — currently USD only.
  Add CAD, GBP, EUR as you take international organisers.
- **Flutterwave live keys** — code is wired but keys are not set. Only
  required when you onboard a francophone-market organizer (XAF/XOF).
- **Mobile app store submission** — EAS build setup shipped; live
  device run pending. Decide if mobile launches with web (recommend
  fast-follow, not co-launch).

## E. Post-launch backlog (nice-to-have, in priority order)

From `OUTSTANDING.md` "Quick wins":

1. **Discount codes** (M) — `discount_codes` table + tier validation +
   checkout discount path. Largest commerce gap.
2. **Group ticket UI** (S) — tier already has `isGroup` / `groupSize`;
   surface them on the public register form.
3. **Speaker edit endpoint** (S) — `PATCH /speakers/:id` + edit form on
   dashboard (currently delete + recreate).
4. **Stakeholder digest cron** (S) — weekly summary email per org
   owner using `AnalyticsService.rollup`.
5. **Mobile chat parity** (M) — wire engagement gateway into mobile
   event-home tabs.

Plus the larger Campaigns slices parked after Slice A: B (custom
audience builder + scheduled sends), C (drip triggers), D (per-org
domain authentication wizard UI). Spec is in `CAMPAIGNS_SPEC.md`.

## F. Cutover sequence (when you flip the switch)

Once items 1 and 2 from section B are done:

1. Apply counsel-redlined legal markdown into the four legal page
   TSX files; remove draft-notice banner from `legal/layout.tsx`.
2. Run `pnpm test` end-to-end on the prod-shaped staging environment.
3. Run a full dry-run on staging: org → event → tiers → publish →
   register → pay (each enabled provider) → refund → check-in. All
   green, with emails received. Per `LAUNCH_CHECKLIST.md` §2.
4. Push to prod, take a Neon snapshot, run `db:migrate:status` to
   confirm 0 pending.
5. Smoke-test the live `orkora.events` from a clean browser session.
6. Hand-onboard the first organisers using `TESTER_GUIDE.{md,pdf,docx}`.
7. Watch Sentry + payments-reconciliation channel for the first 72
   hours.

Rollback parachutes: Render instant rollback (API), Vercel instant
rollback (web), Neon PITR to any second within the retention window
(database).

## Sources

- `OUTSTANDING.md` — line-item backlog with size estimates
- `LAUNCH_CHECKLIST.md` — sequential pre-flight, dry-run, cutover, rollback, comms, monitoring
- `LAUNCH_READINESS.md` — staged readiness plan with [BETA] / [SCALE] / [FOLLOW] tags
- `LAUNCH_RUNBOOKS.md` — incident response, deploy/rollback, restore, secret rotation, on-sale war room, Sentry alert drill (§R-9)
- `SECURITY_REVIEW_2026-05-30.md` — full OWASP review with all 18 addenda
- `THREAT_MODEL.md` — 8 attack surfaces, per-surface mitigations + tests
- `LEGAL_REVIEW_PACKET.md` + `LEGAL_REVIEW_BINDER.pdf` — counsel handoff materials
- `DOMAIN_AUTH_FOR_ORGS.md` — SPF/DKIM/DMARC runbook per organising domain
- `SECURITY_AUDIT.md` — the `pnpm security:all` harness and report layout
- `DEPLOY.md` — Render/Vercel/Neon deploy procedures, JWT key rotation runbook
- `CAMPAIGNS_SPEC.md` — Slice A shipped; B/C/D parked
- `DELEGATE_FLOW.md` — end-to-end delegate journey including sessions and comments
- `ONE_PAGER.md` — what Orkora is, who it is for, the elevator pitch
