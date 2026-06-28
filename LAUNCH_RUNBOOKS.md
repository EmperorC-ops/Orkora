# Orkora - Launch Runbooks (Stage 0 + Stage 1)

Operational steps for the foundations stages. These are executed by you against
Neon / Render / Vercel; the agent can prepare code and configs but cannot touch
those dashboards.

---

## 0.1 Staging environment

Goal: a full second environment so we never test against production again.

Database (Neon):
1. In Neon, create a branch of the production database (e.g. `staging`). A branch
   is a cheap copy-on-write clone, ideal for staging and for restore drills.
2. Copy its pooled connection string for the API env below.

API (Render):
1. New Web Service from the same repo, name `orkora-api-staging`, branch `main`
   (or a `staging` branch if you want to gate).
2. Env vars: same set as prod but pointing at staging resources, and PROVIDER
   TEST KEYS only:
   - `DATABASE_URL` = staging Neon pooled URL
   - `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` = Stripe test mode
   - `PAYSTACK_SECRET_KEY` = Paystack test mode
   - `FLUTTERWAVE_*` = test (when wired)
   - `APP_URL` = the staging web URL (below)
   - separate `R2_*` bucket (or a `staging/` prefix), separate `JWT` keypair,
     `PEPPER`, ticket secret, `SUPERADMIN_EMAIL`, Postmark (a test stream).
3. Keep it on a paid always-on instance (so no cold starts skew testing).

Web (Vercel):
1. New Vercel project (or a `staging` Git branch with its own env scope) with
   Root Directory `apps/web`.
2. Env: `NEXT_PUBLIC_API_URL` (or equivalent) pointing at the staging API.

Provider webhooks: point each provider's TEST webhook at the staging API
(`/v1/payments/webhook/:provider` - public, signature-verified per provider).
Subscribe the refund events too (`charge.refunded` for Stripe,
`refund.processed` for Paystack/Flutterwave); see DEPLOY.md step 6 for the full
event list. Refunds also settle synchronously and via reconciliation, so the
webhook is a fallback, not the sole path.

Exit: you can push, see it deploy to staging, run a full flow with test keys,
and nothing there can touch real money or prod data.

---

## 0.2 Observability + alerting

The code is wired for this: the API has a liveness check `GET /health` (200 if
the process is up, no DB dependency), a readiness check `GET /health/ready`
(200 when the DB is reachable, **503** when it is not), and the global error
filter reports every 5xx to Sentry tagged with the request id, method, and path.
4xx are not sent (no noise). So Stage 0.2 is just wiring the dashboards.

Health endpoint URLs (replace the host with your prod API):
- Liveness:  `https://orkora-api.onrender.com/health`
- Readiness: `https://orkora-api.onrender.com/health/ready`

1. Confirm Sentry is set: `SENTRY_DSN` is present on the prod API service (and,
   if you use it, the web project). `release` auto-fills from the Render/Vercel
   commit env, so issues group by deploy.
2. Verify Sentry capture end-to-end without breaking anything:
   - Set `ENABLE_DEBUG_ROUTES=true` on the target service and let it redeploy.
   - `curl https://orkora-api.onrender.com/v1/health/debug-sentry` (returns 500).
   - Confirm the event "Sentry test error ... (deliberate)" appears in Sentry
     with a request_id tag and readable stack.
   - Set `ENABLE_DEBUG_ROUTES=false` (or remove it). The route goes inert (404).
   - For the web app, do the same kind of check from a real error path, or rely
     on the API capture above; upload source maps if web traces are minified.
3. Uptime monitor (UptimeRobot / BetterStack), every 1-2 min:
   - Primary: `GET /health/ready` on prod, alert when status != 200. This
     catches a DB outage (the endpoint returns 503), not just a dead process.
   - Optional liveness: `GET /health` to distinguish "process down" from
     "DB down".
   - Optional synthetic: load a real public event page so a broken front end
     also alerts.
   - Route alerts to email + a Slack channel.
4. Set Render's own service health-check path to `/health` (liveness) so a DB
   blip does not trigger a restart loop; the uptime monitor on `/health/ready`
   is what pages you for a real dependency outage.
5. Alert policy: decide who gets paged and for what. Suggested triggers:
   readiness down (503) for >2 min, a sustained 5xx rate in Sentry, and the
   "Payment reconciliation drift detected" / "Refund reconciliation drift
   detected" warning logs from the reconciliation cron.

Exit: the deliberate error shows in Sentry; pointing the readiness monitor at a
DB outage (or stopping the service) triggers an alert; Render health uses
liveness so blips don't restart-loop.

---

## 0.3 Backup + restore drill (Neon PITR)

1. Confirm Neon point-in-time-recovery retention on the prod project (note the
   window: 24h on the free plan, 7 days on Launch, 30 days on Scale) and that
   it covers your acceptable data-loss target.
2. Drill: create a Neon branch from a timestamp ~1 hour ago. In the SQL Editor,
   switch the branch selector to the new branch and run
   `select count(*) from users; select count(*) from events;` to confirm the
   data is intact. Time the whole thing from "click Create branch" to "verify
   query returned"; that is your RTO. Delete the branch when done.
3. Write down RPO (max acceptable data loss = your PITR window) and RTO (time
   to restore = what you just measured) and where this runbook lives.

Gotcha: Neon's free plan caps total compute hours across branches per month, so
running this drill (or standing up the staging branch in 0.1) can hit the
ceiling and lock you out of the verify step mid-drill. The Launch plan
($19/month) removes the cap and extends PITR retention to 7 days; it's the
same upgrade Stage 0.1 needs.

Exit: you have personally restored the database once and know your RPO/RTO.

---

## 1.1 Migration safety (DONE - forward-only SQL migrations)

`prisma db push` is unsafe here and is no longer used. It diffs `schema.prisma`
against the live DB and tries to DROP everything the Prisma schema does not
model - which includes the SQL-only objects this project relies on: the
`uuidv7()` function, the `event_metrics` table, the `event_daily_rollup`
materialized view, and the row-level-security policies. (We hit this directly:
`db push` aborted with "cannot drop table event_metrics".)

Hard rule: NEVER run `prisma db push` or `prisma migrate deploy` against any
real database. `prisma generate` (client only) is fine.

How schema changes work now:
- `schema.sql` (repo root) is the canonical fresh-install script: full DDL, the
  uuidv7() function, RLS policies, everything. A brand-new database is created
  from it (the entrypoint applies it once when `BOOTSTRAP_SCHEMA=true`).
- `apps/api/migrations/NNNN_description.sql` holds forward-only, numbered,
  idempotent migrations for *existing* databases.
- `apps/api/scripts/migrate.mjs` applies any migrations not yet recorded in the
  `schema_migrations` table, each in its own transaction, under a Postgres
  advisory lock (concurrent instances cannot race). It also refuses to run if an
  already-applied migration's contents changed (forward-only = immutable).
- On deploy, the container entrypoint runs the migrations automatically before
  the app serves traffic (`RUN_MIGRATIONS_ON_BOOT=true`, the default). To run
  them out-of-band instead, set that to `false` and use a Render Pre-Deploy
  Command: `node scripts/migrate.mjs`.

Adding a schema change (the one workflow to remember):
1. Edit `schema.sql` so fresh installs get the change.
2. Add `apps/api/migrations/000N_my_change.sql` with the same change, written
   idempotently (`add column if not exists`, `create index if not exists`, ...).
3. If `schema.prisma` is affected, update it too and run `pnpm prisma:generate`.
4. Apply locally and verify: `pnpm --filter @orkora/api db:migrate:status` then
   `pnpm --filter @orkora/api db:migrate`.
5. Commit. CI/deploy applies it to staging then prod automatically on boot.

Manual apply (e.g. before a deploy, or to a specific DB):
`node apps/api/scripts/migrate.mjs --url "<DATABASE_URL>"`
Status only (applies nothing): add `--status`.

Per-change apply-to-prod safety: take/confirm a Neon backup (or note the PITR
timestamp from 0.3) before a structural change, deploy to staging first, then
prod during a low-traffic window; restore from PITR if wrong.

Exit (met): schema changes ship as reviewed, forward-only, idempotent SQL
migrations applied through a tracked runner; `db push` is never run.

---

## 1.2 Tenancy isolation (status)

Audited this pass and found sound: `RolesGuard` authorizes every org action
against a JWT membership for the resolved org id (header -> param -> body), with
platform superadmin as the only cross-org bypass; the core services
(events/registrations/payments org-actions/orgs/attendees) scope by org via
`findFirst({ id, organizationId })` or an `assertEventInOrg` precheck. Public
buyer payment flows (`getOrderStatus`/`settleOrder`/checkout) are keyed by an
unguessable order id by design.

Locked with unit tests: `apps/api/src/common/guards/roles.guard.spec.ts` pins the
cross-org denial, role hierarchy, superadmin-only bypass, and org-id resolution.

Follow-ups:
- Add service-level e2e tenancy tests (two orgs, real DB) once the staging/test
  DB exists, to cover the `assertEventInOrg`-style prechecks end to end.
- Review `engagement.service` (live chat/polls look up channels/messages/polls by
  id); confirm its attendee-access model prevents cross-event/cross-org access.
  Not in the core beta loop, but close it before enabling live features broadly.
- Note: memberships are baked into the 15-min access token; removing a member is
  effective on next token refresh, not instantly. Acceptable; document it.

---

## 6.1 NDPR baseline (organizational)

The technical safeguards are mostly in place (TLS, argon2, peppered token
hashes, RLS-ready schema, tenant scoping audited, audit log, refresh-token
rotation + reuse detection, rate limits, ValidationPipe). NDPR also asks for
*organizational* practices. Each item below is a small artifact to commit to
the repo or to your shared drive; together they form the file you would hand
NITDA if asked.

1. **Designate a DPO** (or document why you fall below the threshold that
   requires one). Name, email, and accountability mandate. Put it in the
   privacy policy (`/legal/privacy`, currently `[FILL IN]`).
2. **Record of Processing Activities (ROPA)**. One sheet listing each
   processing activity (account auth, ticketing, payments, live engagement,
   support, analytics), its lawful basis (contract / legitimate interest /
   legal obligation), the categories of data, retention, sub-processors, and
   transfer mechanism if cross-border.
3. **Sub-processor list** (publish on the privacy page or link to it): Render,
   Cloudflare R2, Neon, Postmark, Sentry, Stripe, Paystack, Flutterwave.
   Region + DPA reference per row.
4. **Data retention defaults** (already drafted in the privacy policy; pin
   the exact numbers): account 12 months post-closure, audit + webhook
   events 24 months, server logs 90 days. Anything you keep longer needs a
   reason.
5. **Breach response runbook**: detection sources (Sentry 5xx alerts,
   UptimeRobot, audit-log anomalies), on-call owner, NITDA notification
   target (within 72 hours of awareness), data-subject notification template,
   post-incident review template.
6. **Data Subject Rights (DSR) workflow**: `privacy@orkora.events` intake, 30-day
   SLA, internal runbook for handling access / deletion / correction
   requests, log of requests served. Stub the privacy@ mailbox to a real
   inbox before opening to the public.
7. **DPIA template** for any new feature that processes new categories of
   personal data or introduces new sharing.
8. **Annual review**: refresh DPAs with sub-processors, re-validate the ROPA,
   re-test the breach runbook, redo a DSR drill.

Exit: each artifact above exists, has an owner, and a calendar reminder for
the annual refresh. Below the NDPR threshold for a mandatory DPO, you can
self-assess but the workflow should still exist.

---

## 6.2 Email domain authentication (SPF / DKIM / DMARC)

Why: transactional email from `hello@orkora.events` and `privacy@orkora.events` is
much more likely to land in inboxes (and harder to spoof) when the sending
domain is properly authenticated. Without this, Gmail and the major corporate
filters will downrank you, and you cannot pass NDPR data-subject
communications via email reliably.

You should set this up against your Postmark sending domain (e.g.
`mail.orkora.events`).

1. In Postmark dashboard, open your Server -> Sending domain. Add the
   subdomain you want to send from (`mail.orkora.events`). Postmark shows you the
   exact DNS records to add.
2. In your DNS provider (Cloudflare / Namecheap / wherever `orkora.events` lives),
   add:
   - **SPF**: a TXT record at `mail.orkora.events` (or at the apex, depending on
     setup) containing `v=spf1 include:spf.mtasv.net ~all`. Only ONE SPF
     record per domain; if you already have one for a different sender,
     merge the includes.
   - **DKIM**: a CNAME record at `[postmark-prefix]._domainkey.mail.orkora.events`
     pointing to Postmark's published target. Postmark generates the prefix
     and target for you.
   - **Return-Path**: a CNAME from `pm-bounces.mail.orkora.events` to
     Postmark's bounce host (`pm.mtasv.net` per Postmark's instructions).
   - **DMARC**: a TXT record at `_dmarc.orkora.events` containing
     `v=DMARC1; p=quarantine; rua=mailto:dmarc@orkora.events; ruf=mailto:dmarc@orkora.events; pct=100; adkim=s; aspf=s`.
     Start with `p=quarantine`; tighten to `p=reject` after a couple of weeks
     of clean reports.
3. Back in Postmark, click **Verify** on each record. They should flip green
   within a few minutes.
4. Send one transactional email (e.g. a sign-in OTP) and inspect the headers
   in Gmail / Outlook: SPF, DKIM, and DMARC should all show `pass`.
5. Run `https://www.mail-tester.com` once for a 10/10 sanity check.

Exit: SPF, DKIM, DMARC all pass in the inbox header view; Postmark verify
page shows all green; a DMARC aggregate report has arrived at `dmarc@` (or
your chosen mailbox) within 24-48 hours, confirming the policy is live.

---

## R-9. Sentry alert drill (A09 verification)

### Why this exists

OWASP A09 (Security Logging & Monitoring Failures) requires evidence that production errors actually reach a human. "We installed Sentry" is not evidence. This drill is the evidence: a synthetic error is dropped into production, it shows up in Sentry, and a named on-call gets paged within an SLA. Re-run quarterly and after every Sentry / paging config change.

### Frequency

- **First time:** before public launch.
- **Repeat:** quarterly, on the 15th of January, April, July, October.
- **After change:** whenever Sentry DSN, alert rules, or on-call rotation changes.

### Pre-flight (read before running)

1. Confirm Sentry DSN env vars are set in BOTH the API (`SENTRY_DSN` in Render → orkora-api → Environment) and the web app (`SENTRY_DSN` in Vercel → orkora-web → Settings → Environment Variables → Production).
2. Confirm Sentry alert rules exist: open Sentry → Alerts → look for at least one rule on each project that triggers on "new issue" and routes to the on-call email / Slack channel.
3. Confirm the on-call rotation has a named person for this hour (Sentry → Settings → Teams → on-call schedule).
4. Tell the on-call: "Synthetic error drill incoming. ACK in #ops when it pages."

### Step 1 — Drop a synthetic 500 in the API

```powershell
# From any machine that can reach the production API.
curl https://api.orkora.events/v1/health/_synthetic-500
```

The endpoint at `apps/api/src/modules/health/health.controller.ts` should expose a `_synthetic-500` route that throws `new Error('synthetic alert drill - ignore')` if-and-only-if a short-lived token query parameter matches `SYNTHETIC_DRILL_TOKEN`. If that route does not exist yet, add it before the first drill (and remove the gate after the public launch is stable).

Expected: HTTP 500 response within a second.

### Step 2 — Drop a synthetic JS error in the web app

```js
// In the browser console at https://orkora.events
window.__forceSentry?.('synthetic alert drill - ignore') || (() => { throw new Error('synthetic alert drill - ignore'); })();
```

The web app's `apps/web/app/_components/SentryClient.tsx` should expose `window.__forceSentry` to push a captured exception. If not present, the bare `throw` still surfaces (Next captures uncaught errors).

Expected: a JS error breadcrumb in Sentry's Issues feed within 30 seconds.

### Step 3 — Verify the issue appears in Sentry

Within 1 minute of step 1 and step 2:

1. Open Sentry → orkora-api project → Issues. The synthetic API error should be top of list with environment `production`, release tag matching the current commit SHA.
2. Open Sentry → orkora-web project → Issues. The synthetic JS error should be top of list.

If either doesn't appear:
- Check the `SENTRY_DSN` env var is set in the corresponding hosting provider.
- Check Sentry's quota hasn't been exhausted (free tier).
- Check `apps/api/src/main.ts` calls `Sentry.init` with the DSN before the Nest bootstrap.

### Step 4 — Verify the alert routes to a human

Within 5 minutes (or whatever your alert-rule notification delay is set to):

1. The named on-call ACKs in the agreed channel.
2. Sentry → Alerts → Active shows the firing rule with a recent triggered-at timestamp.

If no one ACKs:
- Check the alert rule's "Send notifications to" target (email address / Slack channel id) is valid.
- Check the on-call's notification settings on the receiving end (Slack notification rules, email filters).
- Test by sending a manual test from Sentry → Alerts → the rule → "Send test notification".

### Step 5 — Clean up

1. Resolve the synthetic issues in Sentry: Issues → tick → Resolve. Annotate with "synthetic drill 2026-XX-XX".
2. If the API `_synthetic-500` route uses a one-shot token, rotate the token now via Render env (`SYNTHETIC_DRILL_TOKEN`).
3. Post in #ops: "Drill complete. ACK from {on-call name} at {time}. {pass | fail}."
4. Log the drill in `OPS_LOG.md` (one-line: date, on-call name, ACK time, outcome).

### Pass / fail criteria

- **Pass:** synthetic issue appears in Sentry within 1 minute AND on-call ACKs within 5 minutes.
- **Soft fail:** appears in Sentry but no ACK within 5 minutes — alert rule misconfigured. File a ticket, re-test once fixed.
- **Hard fail:** does not appear in Sentry — instrumentation gap. Block the next deploy until fixed.

### What this drill does NOT cover

- Database alerts (Neon errors). Neon's own alerting goes to the same on-call channel; covered by a separate drill (R-10, scheduled).
- Render / Vercel platform health alerts (deploy failures, 503s on the platform level). Those are platform-level emails; verified by triggering a deliberate bad deploy in staging.
- Payment-provider webhook delivery failures. Covered by the reconciliation sweep that runs hourly and writes a structured log; would surface as a Sentry breadcrumb if persistent.
