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
   window, e.g. 7 days) and that it covers your acceptable data-loss target.
2. Drill: create a Neon branch from a timestamp ~1 hour ago, point a throwaway
   API instance (or local) at it, and confirm the data is intact and the app
   boots. Time how long the whole thing takes.
3. Write down RPO (max acceptable data loss) and RTO (time to restore) and where
   the restore steps live.

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
