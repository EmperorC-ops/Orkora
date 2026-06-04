# Orkora Staging Environment

**Status:** Scaffolded 3 June 2026.
**Closes:** Task #66 [S0] Stand up staging environment (operator clicks pending).

Staging is a fully isolated mirror of production. It runs the same code, the
same schema, the same migrations, on parallel infrastructure with distinct
credentials, distinct billing line items, and TEST-mode payment keys. The
point is to catch prod-bound bugs without putting prod data at risk.

This doc is the operator playbook. Every step has either a vendor-console
URL you click or a command you paste.

---

## 1. Topology at a glance

```
              staging.orkora.events                staging-api.orkora.events
                       |                                       |
              Vercel staging deploy                   Render orkora-api-staging
                       |                                       |
                       +-------- staging-cdn.orkora.events ----+
                       |                                       |
                       +----- Neon project orkora-staging -----+
                                       (Frankfurt)
```

What is shared with prod: the code in the repo, the design system, the
domain. Everything else (DB, Redis, OAuth client IDs, S3 bucket, Stripe
keys, Sentry project) is distinct.

---

## 2. Repository scaffold (already shipped)

| File                                              | Purpose                                                  |
| ------------------------------------------------- | -------------------------------------------------------- |
| `render.staging.yaml`                             | Render Blueprint for the staging API + Redis             |
| `apps/web/app/_components/StagingBanner.tsx`      | Yellow strip shown when `NEXT_PUBLIC_APP_ENV=staging`    |
| `apps/web/app/layout.tsx`                         | Mounts the banner                                        |
| `apps/web/.env.example`                           | Documents `NEXT_PUBLIC_APP_ENV`                          |
| `infra/staging/seed.sql`                          | Minimal idempotent seed (1 org, 1 user, 1 event, 2 tiers) |
| `apps/api/scripts/staging_smoke.mjs`              | End-to-end smoke test against the staging API            |
| `DNS_RECORDS.md` (appendix)                       | Staging subdomain records to add to Lovable workspace DNS |

Nothing in this list touches production code paths. The banner is gated by
an env var that is unset in prod; the smoke script accepts an `API_BASE`
and refuses to write to anything except whatever URL you pass it.

---

## 3. One-time setup (operator clicks)

Follow these in order. Each step is independent of any code change; you can
pause between any two steps. Estimated total time: 45-60 minutes.

### 3.1. Create the staging Neon project

1. Neon Console -> Projects -> New Project.
2. Name: `orkora-staging`. Region: `EU-Central-1 (Frankfurt)`. Postgres 17.
3. Default database: `orkora_staging`. Default role: keep the
   `orkora_owner` default; do not reuse the prod role name.
4. Copy the pooled connection string (`...-pooler.eu-central-1.aws.neon.tech`).
   You will paste it into Render in step 3.3.

### 3.2. Apply the Render Blueprint

1. Render dashboard -> Blueprints -> New Blueprint.
2. Connect the same repo. Branch: `staging` (create the branch locally if it
   does not yet exist: `git switch -c staging && git push -u origin staging`).
3. Render reads `render.staging.yaml` if it is the only Blueprint file on
   the branch. If both `render.yaml` and `render.staging.yaml` exist, Render
   picks `render.yaml` by default; in that case point the Blueprint at
   `render.staging.yaml` explicitly via "Advanced -> Blueprint file path".
4. Apply. Two services are created: `orkora-api-staging` and
   `orkora-redis-staging`. Both will fail the first deploy because env vars
   are unset; that is expected.

### 3.3. Paste env vars on `orkora-api-staging`

In the Render dashboard, open the staging API service -> Environment:

| Variable                        | Value                                                   |
| ------------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`                  | the Neon staging URL from step 3.1                      |
| `JWT_PRIVATE_KEY`               | run `openssl genpkey -algorithm ED25519`; paste output  |
| `JWT_PUBLIC_KEY`                | derive from the private key, paste output               |
| `S3_ENDPOINT`                   | your R2 endpoint                                        |
| `S3_ACCESS_KEY_ID`              | staging R2 API token id                                 |
| `S3_SECRET_ACCESS_KEY`          | staging R2 API token secret                             |
| `S3_BUCKET_MEDIA`               | `orkora-media-staging`                                  |
| `S3_PUBLIC_BASE_URL`            | `https://staging-cdn.orkora.events`                     |
| `POSTMARK_TOKEN`                | Postmark sandbox server token                           |
| `STRIPE_SECRET_KEY`             | `sk_test_...` (TEST mode)                               |
| `STRIPE_WEBHOOK_SECRET`         | created in step 3.6                                     |
| `PAYSTACK_SECRET_KEY`           | `sk_test_...`                                           |
| `PAYSTACK_WEBHOOK_SECRET`       | created in step 3.6                                     |
| `FLUTTERWAVE_SECRET_KEY`        | `FLWSECK_TEST-...`                                      |
| `FLUTTERWAVE_WEBHOOK_SECRET`    | created in step 3.6                                     |
| `GOOGLE_OAUTH_CLIENT_ID`        | a new Google client ID with redirect to staging origin  |
| `APPLE_OAUTH_CLIENT_ID`         | a new Apple Service ID with the staging redirect        |
| `SENTRY_DSN`                    | new Sentry project DSN ("orkora-staging")               |

Trigger a manual redeploy. The API boots once the env validation in
`apps/api/src/config/env.schema.ts` passes (it will refuse to start if a
required var is missing; check the deploy logs).

### 3.4. First-boot schema and seed

The forward-only migration runner applies on every boot, but the first
staging boot has an empty database, so we need `BOOTSTRAP_SCHEMA=true` once.

1. Render -> `orkora-api-staging` -> Environment.
2. Set `BOOTSTRAP_SCHEMA=true`. Save. Render redeploys.
3. Tail the deploy logs: you should see
   `[entrypoint] BOOTSTRAP_SCHEMA=true ... applying schema.sql` followed by
   `[entrypoint] applying pending migrations` listing 0001 through 0004.
4. Once the deploy is green, flip `BOOTSTRAP_SCHEMA=false`. Save. Render
   redeploys; this time the entrypoint should report
   `schema already applied` and skip straight to the migration runner.
5. From your laptop, apply the seed:
   ```powershell
   psql "<staging-database-url>" -f infra/staging/seed.sql
   ```
   The seed is idempotent (ON CONFLICT DO NOTHING per row), so re-running it
   later is harmless.

### 3.5. Add the Vercel staging deployment

Two options. Pick one.

**Option A: dedicated Vercel project (recommended).** Create a second Vercel
project pointed at the same Git repo, deployment branch = `staging`. In the
project's environment variables panel, set:

| Variable                  | Value                                  |
| ------------------------- | -------------------------------------- |
| `NEXT_PUBLIC_APP_URL`     | `https://staging.orkora.events`        |
| `NEXT_PUBLIC_API_URL`     | `https://staging-api.orkora.events`    |
| `NEXT_PUBLIC_APP_ENV`     | `staging`                              |

Pros: separate analytics, separate logs, separate domain settings. Cons:
two Vercel projects to manage. This is the recommended path.

**Option B: same project, branch-scoped envs.** In the prod Vercel project,
add the three vars above scoped to the `staging` git branch only. Add
`staging.orkora.events` to the project's domain list and route it to the
`staging` branch. Pros: one project. Cons: easier to accidentally apply a
staging env var to a prod deploy if you forget the scope. Avoid unless you
have a strong reason.

### 3.6. Payment provider webhooks

For each provider, create a webhook on its dashboard pointing at the
staging API. Copy the secret it gives you and paste it into Render as the
`*_WEBHOOK_SECRET` variable.

| Provider     | Webhook URL                                                          |
| ------------ | -------------------------------------------------------------------- |
| Stripe       | `https://staging-api.orkora.events/v1/payments/webhook/stripe`       |
| Paystack     | `https://staging-api.orkora.events/v1/payments/webhook/paystack`     |
| Flutterwave  | `https://staging-api.orkora.events/v1/payments/webhook/flutterwave`  |

All three must be in TEST mode. Live-mode keys in staging is a P0 incident.

### 3.7. DNS

Add the three records documented in the staging appendix of `DNS_RECORDS.md`.

---

## 4. Verifying the stack

Once 3.1 through 3.7 are done, run the smoke test from your laptop:

```powershell
$env:API_BASE = 'https://staging-api.orkora.events'
node apps/api/scripts/staging_smoke.mjs
```

Expected output:

```
Smoke test against https://staging-api.orkora.events
===========================
  OK    health  -  status=200
  OK    event lookup  -  slug=staging-smoke-event-2026
  OK    register (free)  -  ticketCode=TIX-XXXXXX
  OK    ticket lookup  -  orderId=019e...
  OK    auth gate (unauth)  -  status=401 as expected
===========================
SMOKE OK
```

If any step fails, the smoke output points at the regression. Common
first-time failures and fixes:

| Failure                                             | Likely cause                                              | Fix                                                              |
| --------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| `event lookup status=404`                           | Seed not applied                                          | Re-run `psql ... -f infra/staging/seed.sql`                      |
| `event lookup status=403 cors`                      | CORS_ORIGINS does not include staging.orkora.events       | Render env: set `CORS_ORIGINS=https://staging.orkora.events`     |
| `register status=500`                               | DB missing the tickets.order_id column                    | Confirm migration 0004 ran; check `schema_migrations` table      |
| `register status=400 quantity`                      | Free-tier capacity exhausted on staging                   | `update ticket_tiers set capacity = 100 where id = '019e...05';` |
| `ticket lookup orderId=null`                        | Regression of bug #113 (ticket allocation pre-payment)    | File a P0; do not deploy to prod                                 |

---

## 5. Day-to-day workflow

The `staging` branch tracks `main` ahead of cutover. Two reasonable rhythms:

- **Always-fresh.** Every time you want to test, hard-reset `staging` to
  `main`: `git switch staging && git reset --hard main && git push --force-with-lease`.
  Use when you want staging to mirror the next prod deploy.

- **Long-running feature.** Branch a feature off `staging`, merge into
  `staging`, smoke-test, then merge into `main` for prod. Use for changes
  that need more than one deploy cycle to validate.

Pick per change. Most refactors go through always-fresh; multi-step product
features go through long-running.

---

## 6. Resetting staging from scratch

If staging gets into a state that is faster to bin than to debug:

1. Render -> `orkora-api-staging` -> Suspend.
2. Neon Console -> `orkora-staging` project -> Delete project.
3. Repeat steps 3.1, 3.3, 3.4. Estimated time: 15 minutes.

Render Redis is stateless across deploys (we treat it as a cache), so no
reset needed there.

---

## 7. What staging cannot catch

Be honest about the gaps so that we do not falsely treat a green staging
deploy as a launch gate.

- **Cross-region latency from real attendees.** Staging serves only the
  operator and a handful of internal testers. Production traffic patterns
  (peaks at door open, slow tails through the show) do not appear here.
- **Live payment-provider behaviour.** TEST mode behaves like a sandbox.
  Real Stripe / Paystack quirks (declined cards in specific BIN ranges,
  Flutterwave 3DS step-ups, etc.) only surface in prod.
- **iOS app review behaviour.** App Store review uses the prod URL; an
  iOS-specific regression cannot be tested by running the PWA in staging.
- **Vercel edge caching.** Staging traffic does not warm the Vercel edge
  cache; first-byte time at the edge differs from prod.

---

## 8. Closing #66

Treat this task as completed once:

- [ ] Steps 3.1 through 3.7 have all been done.
- [ ] `node apps/api/scripts/staging_smoke.mjs` prints `SMOKE OK`.
- [ ] Visiting `https://staging.orkora.events` shows the yellow banner.
- [ ] At least one merge from a feature branch into `staging` has been
      performed, smoke-tested, and merged forward to `main`.

When the four checkboxes are ticked, flip #66 to completed. The scaffold
side of #66 is finished (this doc + the seven repo files); the open work is
the operator clicks above.
