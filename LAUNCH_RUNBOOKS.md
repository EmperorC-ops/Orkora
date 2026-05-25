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

1. Sentry: trigger one deliberate error in the API and one in the web app on
   staging; confirm both appear with readable stack traces (upload source maps
   if web traces are minified). Confirm the prod DSN is set on the prod services.
2. Uptime: add an external monitor (UptimeRobot / BetterStack) hitting
   `GET /health` on prod every 1-2 min, plus one synthetic that loads a real
   public event page. Route alerts to email + a Slack channel.
3. Decide an alert policy: who gets paged, and for what (5xx rate, health down,
   payment reconciliation drift).

Exit: a forced error shows in Sentry; killing the service triggers an alert.

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

## 1.1 Migration safety (replace `prisma db push` for prod)

Today the schema is synced with `prisma db push` from a `schema.sql` / Prisma
schema. `db push` computes a diff and can DROP columns or tables without a
prompt - acceptable on a fresh dev DB, unacceptable on prod.

Immediate rule (effective now):
- NEVER run `prisma db push` against the production `DATABASE_URL`. Use it only
  on local/ephemeral dev databases.

Target workflow (adopt Prisma Migrate, baselined onto the existing DB):
1. Make sure `prisma/schema.prisma` exactly matches the live schema.
2. Create the baseline migration without applying it:
   `pnpm --filter @orkora/api exec prisma migrate diff \
      --from-empty --to-schema-datamodel prisma/schema.prisma \
      --script > prisma/migrations/0000_init/migration.sql`
   (or `prisma migrate dev --create-only --name init` against a scratch DB).
3. Mark it as already applied on prod and staging so Prisma does not try to
   re-run it:
   `pnpm --filter @orkora/api exec prisma migrate resolve --applied 0000_init`
4. From now on, every schema change is a new migration:
   `prisma migrate dev --name <change>` (generates + applies on dev),
   reviewed in PR, then applied to staging then prod via:
   `pnpm --filter @orkora/api exec prisma migrate deploy`
5. CI already runs `prisma generate`; add a separate, gated deploy step (manual
   approval) that runs `prisma migrate deploy` against prod, never on every push.

Per-change apply-to-prod runbook:
1. Take/confirm a fresh Neon backup (or note the PITR timestamp).
2. `prisma migrate deploy` on staging; smoke test.
3. `prisma migrate deploy` on prod during a low-traffic window.
4. Verify; if wrong, restore from the backup/PITR point from 0.3.

Exit: schema changes ship through reviewed, forward-only migrations with a
backup taken first; `db push` is never run against prod.

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
