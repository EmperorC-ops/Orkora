# Orkora

Orkora is a multi-tenant event platform for organizers in Africa and beyond. Organizers create events, sell or give away tickets, check attendees in, run live engagement (chat, Q&A, polls) during the event, email their audience, and see analytics. Attendees register, receive a QR ticket by email, and use the web app (installable as a PWA) or the Expo mobile app.

This README is the entry point for a developer taking over the codebase. Read it top to bottom once. Then read [`docs/BUILD_HISTORY.md`](docs/BUILD_HISTORY.md) for how the platform got here, what broke along the way, and why things are the way they are.

**Last updated:** 23 October 2026. History is current to commit `28d5ce8` (22 October 2026).

---

## Contents

1. [Current status](#1-current-status)
2. [Architecture](#2-architecture)
3. [Repository layout](#3-repository-layout)
4. [Running locally](#4-running-locally)
5. [Environment variables](#5-environment-variables)
6. [Database and migrations](#6-database-and-migrations)
7. [Deploying](#7-deploying)
8. [Backend guide (API)](#8-backend-guide-api)
9. [Frontend guide (web)](#9-frontend-guide-web)
10. [Mobile app](#10-mobile-app)
11. [Rules that keep production safe](#11-rules-that-keep-production-safe)
12. [Testing and CI](#12-testing-and-ci)
13. [Open work](#13-open-work)
14. [Documentation index](#14-documentation-index)

---

## 1. Current status

As of 23 October 2026, Orkora is in production. Its largest event so far, WMXKED (24 October 2026, about 200 registrations), has been through a full dry run covering registration, QR and roster check-in, the live room (Q&A and polls) and email campaigns.

| Area | Status |
|---|---|
| Web app | Live at `https://orkora.events` (Vercel). |
| API | Live at `https://api.orkora.events` (Render, Docker, Frankfurt). Auto-deploys from `main`. |
| Database | Neon Postgres. Point-in-time restore drill passed on 3 June 2026 (`docs/dr/DR_DRILL_2026-06-03.md`). |
| File storage | Cloudflare R2 (S3 API): a public media bucket, plus a private bucket for gated recordings served by short-lived signed URLs. |
| Email | Postmark, the only email provider. The account was on a plan capped at 100 emails and has been upgraded; see the incident in BUILD_HISTORY. |
| Error tracking | Sentry on the API, with release tagging. |
| Free events | Fully working end to end. |
| Paid events | Paystack (NGN) was verified live end to end in May 2026. Stripe is coded but **not being pursued** (decision of 7 October 2026), so its keys stay unset. Flutterwave is coded, including the platform-fee split, but has **not** been verified in test mode. |
| Platform fee | Coded (3% plus a flat fee per paid ticket, grandfathered per event) and **switched off**. Switching it on is an environment change, not a code change. See section 13 and `FEE_GOLIVE_CHECKLIST.md`. |
| Beta wording | Removed from the marketing pages and dashboard copy (commit `add3c46`). It **remains** in `apps/web/legal/terms.md` (sections 4 and 7), `apps/web/legal/organizer.md` (section 3) and one note in `billing.service.ts`. It comes out together with the fee decision. |
| Staging | Partly down. The Vercel staging project exists (it had been paused, then was unpaused). The Render staging API it points to is missing, so staging cannot be used end to end. Rebuilding it is on the open list. |
| Mobile (Expo) | The app exists (event code, login, register, ticket, event home) and ships through EAS. The repository records no store release. The PWA is the main mobile path today. |

### Built but not yet committed (at the time of writing)

- **Admin deletion of users and organizations**: `apps/api/src/modules/admin/admin-deletion.service.ts`, its spec, and `apps/web/app/(admin)/admin/DeletionDialog.tsx`. It was tested against a real Postgres built from `schema.sql` plus every migration (23 checks). It still needs to be committed and pushed. See BUILD_HISTORY, stage 9.

---

## 2. Architecture

```
                 Browser / PWA                          Expo app (iOS, Android)
                       |                                        |
                       v                                        |
        Next.js 14 web app (Vercel)                             |
        orkora.events                                           |
          - public event pages, Story Mode, Brand Home          |
          - organizer dashboard, admin console                  |
          - ticket page /t/<code>, live room /e/<code>/live     |
                       |  REST (fetch, Bearer JWT)              |
                       |  WebSocket (Socket.IO) for live room   |
                       v                                        v
              NestJS API (Render, Docker)  api.orkora.events  /v1/*
                 |            |             |             |            |
                 v            v             v             v            v
          Neon Postgres   Cloudflare R2   Postmark   Paystack /     Sentry
          (Prisma +       (media +        (email)    Flutterwave /
           raw SQL)        recordings)               Stripe (unused)
```

- **One API, modular monolith.** Each folder in `apps/api/src/modules/` is a bounded context: auth, orgs, events, registrations, payments and so on. Modules talk through injected services, not HTTP.
- **Global API prefix `/v1`.** `health`, `health/ready` and `metrics` sit outside it (`apps/api/src/main.ts`).
- **Multi-tenancy is enforced in the application layer.** Every organizer route is `organizations/:orgId/...` and passes `RolesGuard`, which checks the caller's membership role for that org. Services always filter by org id. `schema.sql` enables row-level security on several tables, but `TenancyInterceptor` is **not wired**, so RLS is not a backstop today. Read the comment in `apps/api/src/common/interceptors/tenancy.interceptor.ts` before relying on it.
- **Live engagement** runs over Socket.IO (`engagement.gateway.ts`). An attendee can join the live room with their ticket code; the ticket code acts as the credential.
- **Background jobs** are in-process `@nestjs/schedule` crons, for example the payment reconciliation sweeps (`PAYMENTS_SWEEP_CRON`, `PAYMENTS_DAILY_SWEEP_CRON`). They are activity-gated so an idle service lets Neon autosuspend.
- **Redis**: `REDIS_URL` is required by the env schema (`apps/api/src/config/env.schema.ts`) and Render provisions a free Redis. No module currently connects to it. Rate limiting (`ThrottlerModule`) is in-process.

### Auth model

- **Access token:** JWT RS256, 15 minutes, kept in `sessionStorage` on the web and sent as `Authorization: Bearer`.
- **Refresh token:** httpOnly cookie scoped to `.orkora.events` and the `/v1/auth` path, with a double-submit CSRF cookie (`orkora_csrf`) and header (`X-CSRF-Token`). A refresh re-reads organization memberships from the database.
- **Sign-in:** email plus password, or an emailed 6-digit code ("Email me a sign-in code"). The code path creates the account if none exists. Apple and Google sign-in verifiers exist in `auth/verifiers`.
- **Organization roles** (`memberships.role`), lowest to highest: `vendor < staff < organizer < admin < owner`. `@Roles('staff')` means staff or higher. The role is organization-wide, not per event.
- **Platform roles** (`users.platform_role`): `none`, `support`, `superadmin`. `PlatformGuard` gates `/v1/admin/*`; routes default to super admin only. A super admin passes every org role check.

### Money

- All amounts are integers in minor units (`total_minor`, `price_minor`, BigInt in Prisma). Never use floats for money.
- Provider adapters live in `apps/api/src/modules/payments/providers/`, one per provider, behind a registry. The provider used for a checkout comes from the organization's preference per currency; the client cannot force a provider.
- Orders settle through three routes: the provider webhook, verify-on-return when the buyer lands back on `/r/<id>/...`, and a reconciliation sweep. An order whose settled amount or currency does not match is put on **settlement hold** and never issues tickets. Admins resolve holds in the console.
- **Platform fee:** stamped onto each event when it is created (`platformFeeAt()` in `apps/api/src/common/platform-fee.ts`), so existing events keep the fee they were created with. The fee is collected as a provider split (Paystack subaccount `transaction_charge`, Flutterwave subaccounts), gated by `PAYMENTS_CONNECTED_ACCOUNTS=1`.

---

## 3. Repository layout

```
orkora/
  apps/
    api/            NestJS API (port 4000). Modules in src/modules/, SQL migrations in migrations/
    web/            Next.js 14 App Router (port 3000). Routes in app/, shared logic in lib/
    mobile/         Expo SDK 51 + expo-router attendee app
  packages/
    contracts/      Zod schemas shared by API and clients (story blocks, registration fields)
    sdk/            Typed API client
    ui/, theme/     Design tokens
    config/         Shared lint config
  schema.sql        Canonical full database schema for a fresh install (see section 6)
  render.yaml       Render blueprint for the production API (render.staging.yaml for staging)
  infra/docker/     Local Postgres 15, Redis, MailHog, MinIO
  infra/terraform/  Original AWS plan. NOT used by the current hosting (Render + Vercel)
  scripts/          rotate-secrets.sh, synthetic-login-check.mjs, ops/ (one-off production SQL)
  security/         Automated security audit harness (pnpm security:*)
  docs/             BUILD_HISTORY.md, dr/ (restore drill), staging/
  .github/workflows ci.yml, security.yml, synthetic-check.yml, rotate-secrets.yml, deploy-api.yml
  *.md              Specs, runbooks, reviews and legal packets. See section 14
```

### API modules (`apps/api/src/modules/`)

| Module | Responsibility |
|---|---|
| `auth` | Signup, password and email-code login, refresh, logout, social verifiers, OTP |
| `orgs` | Organizations, members, roles, Brand Home (`/o/<slug>`), postal address |
| `invites` | Team invitations (single-use, 14-day token, email must match) |
| `events` | Events, tiers, sessions, tracks, speakers, Story Mode, VIP links, discovery |
| `registrations` | Registration, tickets, check-in (QR, code, roster), attendee lists, resend confirmations |
| `payments` | Providers, checkout, settlement, refunds, connected accounts, onboarding, fee split |
| `engagement` | Live room: chat, Q&A (with anonymous questions), polls, spotlight, moderation |
| `campaigns` | Audience email campaigns over Postmark (flyer, branded header, tokens, test sends) |
| `discounts` | Discount codes and redemptions |
| `recordings` | Recording library and gated playback |
| `feedback` | Attendee ratings, NPS and comments |
| `analytics` | Organizer analytics (org rollup and per event) |
| `billing` | Revenue, refunds and the notional platform fee |
| `uploads` | Presigned R2 uploads (banners, logos, flyers, recordings) |
| `notifications` | Email (Postmark) and SMS (Termii, Twilio) providers |
| `admin` | Platform console: overview, orgs, users (segmented), events, settlement holds, deletion |
| `audit` | Append-only `audit_events` writer (global module) |
| `api-keys` | Organization API keys (`ork_` prefix) with scopes |
| `reports`, `health` | Reporting endpoints, and liveness plus readiness |

### Web routes (`apps/web/app/`)

| Group | Routes |
|---|---|
| Public | `/` (marketing), `/pricing`, `/e/<code>` (event page; Story Mode when published), `/e/<code>/register`, `/e/<code>/vip/<token>`, `/e/<code>/live` (live room), `/e/<code>/watch`, `/o/<slug>` (Brand Home), `/c/<category>`, `/city/<city>`, `/t/<code>` (ticket), `/r/<id>/confirm\|pending\|cancelled` (payment return), `/me/tickets`, `/app` (PWA launcher), `/install`, `/legal/*`, `/invite/accept` |
| Auth | `/login`, `/signup`, `/otp` |
| Organizer | `/dashboard`, `/dashboard/events/[id]` with tabs `registrations`, `checkin`, `live`, `story`, `analytics`, `discounts`, `recordings`, `feedback`; plus `/dashboard/campaigns`, `analytics`, `attendees`, `registrations`, `billing`, `branding`, `settings` |
| Platform admin | `/admin`, `/admin/organizations`, `/admin/users`, `/admin/events` |

---

## 4. Running locally

**Prerequisites:** Node 20 (pinned in `package.json` `engines`), pnpm 10 (`packageManager: pnpm@10.0.0`), Docker, and `openssl`.

```bash
pnpm install

# Local Postgres 15, Redis, MailHog (SMTP catcher) and MinIO (S3)
pnpm db:up

# Env files: copy the examples, then fill in the values (names in section 5)
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Signing secrets: JWT keypair, refresh pepper, ticket signing secret
./scripts/rotate-secrets.sh

# Database: load the full schema once, then record and apply migrations
psql "$DATABASE_URL" -f schema.sql
pnpm --filter @orkora/api run db:migrate          # safe: migrations are idempotent
pnpm --filter @orkora/api exec prisma generate
pnpm --filter @orkora/api run seed                # demo org, owner@demo.orkora.events / Demo1234!, event DEMO2026
SUPERADMIN_EMAIL=you@example.com pnpm --filter @orkora/api run seed:superadmin   # optional

# Run
pnpm --filter @orkora/api dev     # http://localhost:4000 (Swagger at /docs, not served in production)
pnpm --filter @orkora/web dev     # http://localhost:3000
pnpm --filter @orkora/mobile dev  # Expo
```

Do **not** use the root `pnpm db:migrate` script. It runs `prisma migrate dev`, which is the wrong tool for this database (see section 6). Use `pnpm --filter @orkora/api run db:migrate`.

To get email codes locally without a Postmark token, set `LOG_OTP_TO_CONSOLE` (a development break-glass) and read the code from the API log. Never enable it in production.

---

## 5. Environment variables

Values never go in the repository. Production values are set in the Render dashboard (API) and the Vercel dashboard (web). The examples are `.env.example`, `apps/api/.env.example` and `apps/web/.env.example`. The validated schema is `apps/api/src/config/env.schema.ts`. Changing an API variable needs a redeploy or restart on Render.

| Group | Names (API unless noted) |
|---|---|
| Core | `NODE_ENV`, `PORT`, `LOG_LEVEL`, `APP_URL`, `API_URL`, `CORS_ORIGINS`, `COOKIE_DOMAIN` |
| Database and cache | `DATABASE_URL` (Neon), `REDIS_URL` (required by the schema, unused, see section 2) |
| Auth | `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_PUBLIC_KEY_PREVIOUS` (for rotation overlap), `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `REFRESH_TOKEN_PEPPER`, `GOOGLE_OAUTH_CLIENT_ID`, `APPLE_OAUTH_CLIENT_ID` |
| Tickets and previews | `TICKET_SIGNING_SECRET`, `STORY_PREVIEW_SECRET` |
| Storage (R2) | `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_MEDIA`, `S3_BUCKET_RECORDINGS`, `S3_PUBLIC_BASE_URL` (must include `https://`), `S3_FORCE_PATH_STYLE`, `AWS_REGION`, `MAX_UPLOAD_BYTES` |
| Email and SMS | `POSTMARK_TOKEN` (a fatal Sentry event is raised if it is missing in production), `POSTMARK_WEBHOOK_TOKEN`, `EMAIL_FROM_ADDRESS`, `CAMPAIGN_POSTAL_ADDRESS`, `CAMPAIGNS_DAILY_CAP_PER_ORG`, `TERMII_API_KEY`, `TWILIO_SID`, `TWILIO_AUTH_TOKEN`, `LOG_OTP_TO_CONSOLE` (development only) |
| Payments | `PAYSTACK_SECRET_KEY` (also used to verify Paystack webhooks; `PAYSTACK_WEBHOOK_SECRET` is not used for that), `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_API_VERSION` (keep Stripe keys unset), `ORDER_HOLD_TTL_MIN`, `PAYMENTS_SWEEP_CRON`, `PAYMENTS_DAILY_SWEEP_CRON` |
| Platform fee | `PAYMENTS_CONNECTED_ACCOUNTS`, `PLATFORM_FEE_EFFECTIVE_AT` (unset means the fee is off), `PLATFORM_FEE_BPS`, `PLATFORM_FEE_FLAT_MINOR`, `PLATFORM_FEE_FLAT_CURRENCY`, `PLATFORM_FEE_FLAT_<CUR>` (for example `PLATFORM_FEE_FLAT_NGN`) |
| Ops | `SENTRY_DSN`, `SENTRY_RELEASE`, `RENDER_GIT_COMMIT`, `READY_PROBE_INTERVAL_MS`, `CSP_REPORT_URI`, `ENABLE_DEBUG_ROUTES`, `BOOTSTRAP_SCHEMA`, `RUN_MIGRATIONS_ON_BOOT` |
| Web (Vercel) | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_ENV` |
| Mobile | `EXPO_PUBLIC_API_URL` |
| Seeding | `SUPERADMIN_EMAIL`, `SUPERADMIN_NAME` |

---

## 6. Database and migrations

**Read this section before changing the schema.**

- **`schema.sql`** (repo root) is the canonical, complete schema for a fresh install: tables, the `uuidv7()` function, indexes, SQL-only objects and RLS statements.
- **`apps/api/migrations/NNNN_name.sql`** are numbered, forward-only and idempotent (`IF NOT EXISTS`, wrapped in `BEGIN`/`COMMIT`). At the time of writing they run from `0001` to `0028`.
- **`apps/api/scripts/migrate.mjs`** applies pending migrations in order, each in its own transaction, under an advisory lock, and records them in `schema_migrations`. `--status` lists applied and pending migrations without changing anything.
- **Migrations run automatically when the API boots** (`docker-entrypoint.sh`, `RUN_MIGRATIONS_ON_BOOT` defaults to true). Pushing a migration to `main` therefore applies it to production on the next Render deploy.
- **`apps/api/prisma/schema.prisma`** mirrors the tables for typed access and must be kept in step by hand. Never run `prisma db push` or `prisma migrate` against a real database: Prisma does not know the SQL-only objects and will try to drop them.

**To change the schema:**

1. Write `apps/api/migrations/00NN_description.sql`, idempotent and forward-only.
2. Fold the same change into `schema.sql`.
3. Update `schema.prisma` and run `prisma generate`.
4. Load `schema.sql` plus every migration into a scratch database and confirm it applies cleanly.
5. Make the code tolerate both the old and the new schema during the deploy window, or ship the migration first.

**Production data fixes** (cleanups, seat releases) are hand-written SQL scripts in `scripts/ops/`, with guards and a preview step. The operator runs them; nothing in CI runs them.

Several foreign keys referencing `users`, `events` and `orders` are deliberately **not** `ON DELETE CASCADE`, so financial and attendance records cannot vanish by accident. `admin-deletion.service.ts` documents the safe deletion order.

---

## 7. Deploying

| Target | How |
|---|---|
| API | Push to `main`. Render builds `apps/api/Dockerfile` (`nest build --builder swc`), boots, applies pending migrations, then serves. If the build fails, **Render keeps serving the previous build**, so check the Render deploy status after every push. |
| Web | Push to `main`. Vercel builds with Root Directory `apps/web`, using `apps/web/vercel.json`. The commit author email must be recognized by the Vercel account or the deploy will not run. |
| Mobile | EAS builds. See `MOBILE_RELEASE.md`. |
| Secrets | `scripts/rotate-secrets.sh` mints new values; `DEPLOY.md` has the rotation runbook, including zero-downtime JWT rotation through `JWT_PUBLIC_KEY_PREVIOUS`. |

**Deploy skew:** the web and the API deploy independently and the web usually finishes first. If the web sends a field the old API does not know, the global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`) rejects it with `property X should not exist`. Ship API changes first, or make the web tolerate the old API.

`DEPLOY.md` is the long-form deploy guide; `DEPLOY_BEGINNER.md` is a click-by-click version. `deploy-api.yml` (AWS ECS) is manual-only and unused.

---

## 8. Backend guide (API)

- **Framework:** NestJS 10, Prisma 5, `pino` logging (credential-bearing URLs are scrubbed by `scrubCredentialUrl` in `app.module.ts`), Swagger at `/docs` outside production only.
- **Validation:** global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted` and `transform`. Nested arrays and objects in DTOs need `@ValidateNested` and `@Type(() => X)`, or their contents are stripped or coerced. That bug destroyed Story Mode and registration-question payloads once; see BUILD_HISTORY.
- **Guards:** `AuthGuard('jwt')` then `RolesGuard` with `@Roles(...)` for organizer routes, and `PlatformGuard` with `@SuperAdmin()` or `@PlatformRoles(...)` for admin routes. `RolesGuard` resolves the org from the route param, and rejects a header or body org that disagrees with it (a cross-tenant protection).
- **Raw SQL:** used for aggregates and multi-step deletes (`$queryRawUnsafe` with positional `$1` parameters). Never interpolate user input into SQL.
- **Audit:** call `AuditService.record()` for sensitive actions such as refunds, role changes and deletions. It never throws.
- **Email:** everything goes through Postmark. Campaigns use the broadcast stream in batches of 500. Campaign templates support the `{{first_name}}`, `{{full_name}}` and `{{email}}` tokens.
- **Tickets:** a ticket `code` is a bearer credential. It is never logged and never shown in public lists. Releasing a seat means setting the ticket status to `cancelled` and decrementing `ticket_tiers.quantity_sold`, clamped at 0. Live tickets are those with status `issued` or `checked_in`; a `pending` ticket holds a seat for an unpaid order.
- **Polls** belong to an agenda session. An event with no sessions cannot have polls; the Live Control console says so.
- **Public reads** redact attendee names to first name plus last initial, and anonymous Q&A questions carry no name at all.

---

## 9. Frontend guide (web)

- **Next.js 14.2 App Router**, Tailwind, `typedRoutes` (cast dynamic hrefs `as Route`).
- **The production build ignores TypeScript and ESLint errors** (`next.config` sets `ignoreBuildErrors` and `ignoreDuringBuilds`). CI runs a separate typecheck and a dedicated `next build` gate. Run `pnpm --filter @orkora/web typecheck` before pushing.
- **API access:** `apiFetch` in `lib/auth.ts` attaches the token, refreshes once on a 401 (single-flight, CSRF-aware) and parses `ApiError`. Each domain has a client module in `lib/` (`events.ts`, `campaigns.ts`, `admin.ts` and so on).
- **The active organization** is read from the JWT (`readActiveOrgId()` in `lib/events.ts`). After any change to a user's memberships (creating an org, accepting an invite), call `refreshSession()` or the dashboard will not see the new organization.
- **Times:** event times render in the event's own timezone. Use `wallTimeToUtcISO` and `utcISOToWallTime` from `lib/events.ts`; never `new Date(localString)`.
- **Ticket and sales state:** `ticketingState(tiers)` in `lib/events.ts` returns `open`, `upcoming`, `closed` or `none` and drives every register button and "Registration closed" message.
- **CSP:** strict and nonce-based in production (`middleware.ts`), disabled in development. Any new external host (storage, analytics, embeds) must be added to the policy, or the browser will block it silently. `vercel.json` sets `Permissions-Policy`; the camera must remain `camera=(self)` for the check-in scanner.
- **PWA:** `public/manifest.webmanifest` (`start_url=/app?source=pwa`) and `public/sw.js`. Bump the service worker version whenever cached page shells or the CSP change, or returning users keep stale shells.

---

## 10. Mobile app

`apps/mobile` is Expo SDK 51 with expo-router, covering the screens `(auth)/code`, `login`, `otp`, `signup` and `(event)/home`, `register`, `ticket`. Its `build` script only type-checks; real builds go through EAS (`MOBILE_RELEASE.md`). The web app has moved well ahead of the mobile app: live room, Story Mode, campaigns and check-in are web only.

---

## 11. Rules that keep production safe

These rules come from real incidents (see BUILD_HISTORY).

1. **No secrets in the repository, logs or tickets.** Ask the operator to set them.
2. **Never run anything against the production database from a development machine or CI.** The operator applies production SQL. Migrations reach production only through the normal deploy.
3. **Migrations are forward-only and are folded into `schema.sql`.** No Prisma migration tooling on real databases.
4. **Never destroy financial records.** Paid or refunded orders, payments, invoices and wallet entries are kept. Delete flows refuse, and offer suspend or erase instead.
5. **Watch for invisible characters.** Literal U+2028 or U+2029 characters (line and paragraph separators) and NUL bytes have broken builds twice. The API build broke completely because of one inside a regex. Grep changed files for them before committing.
6. **The SWC build does not type-check, and a failed Render build is silent to users.** Typecheck locally and check the Render deploy result after every API push.
7. **Ship API before web when a request shape changes** (see deploy skew in section 7).
8. **Ticket codes and invite tokens are credentials.** Never log them, put them in analytics, or show them in lists.
9. **Commits:** remove any stale `.git/index.lock`, stage explicit paths, and never use `git add -A` or `git add .`. The repository is `github.com/EmperorC-ops/Orkora`, so push with an account that has write access to it.

---

## 12. Testing and CI

- **API unit tests:** Jest, `*.spec.ts` next to the code (about 50 files), run with `pnpm --filter @orkora/api test`. Database-heavy logic is unit-tested with mocked Prisma. For destructive SQL, also run it against a scratch Postgres built from `schema.sql` plus all migrations.
- **Web tests:** small Node scripts (`apps/web/scripts/test-*.mjs`): safe redirect and month buckets.
- **CI** (`.github/workflows/ci.yml`): lint, typecheck and test, then build, then a dedicated `next build` gate for the web. Prisma Client is generated in CI before typecheck.
- **Security** (`security.yml`): weekly and on dependency changes. Covers dependency audit, secrets scan, web bundle leak scan, API authorization abuse tests, transport posture and an optional ZAP scan. Run it locally with `pnpm security:all`.
- **Synthetic check** (`synthetic-check.yml`): checks the production login page every 6 hours and after each deploy, with retries for transient blips.

---

## 13. Open work

In rough priority order. Details for each item are in BUILD_HISTORY.

1. **Pricing and general availability:** decide how the platform fee starts. Either send the 60-day notice promised in the Terms (draft in `FEE_NOTICE_DRAFT.md`) and set `PLATFORM_FEE_EFFECTIVE_AT`, or change the Terms with counsel's sign-off. Then remove the remaining beta wording. Follow `FEE_GOLIVE_CHECKLIST.md`.
2. **Payment verification:** run the Paystack test-mode split and refund check, then the Flutterwave test-mode run, recording what happens to the wallet, the subaccount and the refund record.
3. **Commit and push the admin deletion feature,** then try it on one test account first.
4. **Rebuild staging:** Render API, Neon branch and DNS (`docs/staging/STAGING.md`, `render.staging.yaml`).
5. **Per-event analytics "Insights":** slicers (date, tier, status, VIP, form answers), check-in arrival chart, CSV export. An optional later phase records the link each registrant came from.
6. **Polls without sessions,** for single-talk events. Needs a schema change.
7. **Event-scoped team access** with automatic expiry. Roles are organization-wide today.
8. **Signup-abuse hardening, Phase 2:** the Phase 1 audit is done and three product questions are open (fixed versus sanitized subjects, limiting test sends to verified members, whether the Postmark server is dedicated).
9. **Optional:** sign in directly from the invite link; push notifications (`PUSH_NOTIFICATIONS_DESIGN.md`); mobile parity with the web.
10. **Tidy up:** promote ESLint warnings to errors; delete or update the unused Terraform and AWS workflow; decide what to do with Redis.

---

## 14. Documentation index

Root documents, grouped by topic. **History** means the document is an accurate snapshot of its date but parts are now outdated; check against this README.

| Topic | Documents |
|---|---|
| Start here | `README.md` (this file), `docs/BUILD_HISTORY.md` |
| Original design | `EVENTAPP_BLUEPRINT.md` (history; plans AWS, but production runs on Render and Vercel), `PHASE1_IDENTITY.md`, `PHASE2_EVENTS.md`, `PHASE3_PLAN.md`, `PHASE3_SLICE_3_1.md` to `3_3.md` (history) |
| Status snapshots | `SESSION_HANDOFF.md` (history, 25 May 2026), `OUTSTANDING.md` (history), `PATH_TO_PRODUCTION.md`, `LAUNCH_READINESS.md`, `LAUNCH_CHECKLIST.md`, `LAUNCH_RUNBOOKS.md` |
| Deployment and ops | `DEPLOY.md`, `DEPLOY_BEGINNER.md`, `DNS_RECORDS.md`, `DOMAIN_AUTH_FOR_ORGS.md`, `MOBILE_RELEASE.md`, `docs/staging/STAGING.md`, `docs/dr/DR_DRILL_2026-06-03.md` |
| Payments and fees | `PLATFORM_FEE_ROLLOUT.md`, `FEE_GOLIVE_CHECKLIST.md`, `FEE_GOLIVE_RUNBOOK.md`, `FEE_NOTICE_DRAFT.md`, `STRIPE_FLUTTERWAVE_SPLIT_SCOPE.md` (Stripe dropped 7 Oct 2026), `BILLING_ENFORCEMENT_SLICE.md` |
| Feature specs | `CAMPAIGNS_SPEC.md`, `REGISTRATION_QUESTIONS.md`, `LIVE_SECOND_SCREEN_DESIGN.md`, `DELEGATE_FLOW.md`, `PUSH_NOTIFICATIONS_DESIGN.md`, `ORKORA_WORKFLOW.md` |
| Security | `SECURITY_REVIEW.md`, `SECURITY_REVIEW_2026-05-30.md`, `SECURITY_REVIEW_2026-07-23.md`, `SECURITY_AUDIT.md`, `SECURITY_AUDIT_2026-08.md`, `SECURITY_REVIEW_API.md`, `SECURITY_REVIEW_WEB.md`, `SECURITY_FIX_E2E_2026-07-07.md`, `API_EXPOSURE_AUDIT_2026-07-25.md`, `API_EXPOSURE_AUDIT_PLAYBOOK.md`, `THREAT_MODEL.md`, `security/` |
| Legal | `LEGAL_REVIEW_PACKET.md`, `LEGAL_REVIEW_BINDER.pdf`, `LEGAL/`, published texts in `apps/web/legal/*.md` (marked "draft for counsel review") |
| Brand and product | `BRAND_VOICE.md`, `DESIGN/`, `COPY/`, `ONE_PAGER.*`, `BUILD_RISK_ASSESSMENTS.md`, `PLAYBOOK_INTEGRATION_2026-08.md` |
| Testing | `TESTER_GUIDE.*`, `SMOKE_TEST_new_features.md` |

## License

Proprietary. Orkora Technologies Limited. Internal use only.
