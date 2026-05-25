# Deploying Orkora

This is the production go-live guide for the current build (Phases 1 through 7
plus polish). The recommended stack for the first hosted environment is:

| Piece                       | Recommendation                            | Reason                                                                |
| --------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| API (NestJS)                | Render web service, Frankfurt             | One-blueprint deploy, native Docker support, low ping to Africa       |
| Postgres                    | Neon (or Render Postgres for previews)    | Branchable databases, generous free tier, runs PG 15                  |
| Redis                       | Upstash (or Render Redis)                 | Rate limiting + future queues; works fine with `ioredis`              |
| Object storage (R2 / S3)    | Cloudflare R2 with a custom domain        | S3-compatible, no egress fees, attaches a public CDN domain           |
| Web (Next.js)               | Vercel                                    | Edge cache, atomic deploys, native pnpm + monorepo support            |
| Mobile (Expo)               | Expo Go preview, EAS Build for stores     | Same-day previews; EAS for App Store / Play Store later               |
| Email                       | Postmark                                  | Best transactional deliverability                                     |
| SMS                         | Termii (Africa) + Twilio (rest of world)  | Provider already handled by the API; add keys when needed             |
| Webhook tunnels (dev only)  | Stripe CLI / cloudflared                  | Forward provider webhooks to localhost during integration             |

The total list of secrets you need ready before pressing buttons is in
`.env.example` files at the repo root and inside `apps/api/`. Print them out
or open them in another window.

## 0. Prerequisites

- GitHub repo with this codebase pushed to `main`
- Render, Vercel, Cloudflare, and Postmark accounts (free tiers are fine)
- Locally: `pnpm`, `openssl`, and Docker installed

## 1. Mint deploy secrets

The API signs access and refresh tokens with RS256, peppers refresh-token
hashes, and HMAC-signs ticket QR codes. All four secrets can be minted in
one shot:

```bash
./scripts/rotate-secrets.sh        # mints JWT keypair + pepper + ticket secret
./scripts/rotate-secrets.sh jwt    # only the JWT keypair
./scripts/rotate-secrets.sh pepper # only REFRESH_TOKEN_PEPPER
./scripts/rotate-secrets.sh ticket # only TICKET_SIGNING_SECRET
```

The script writes nothing to disk; it prints `KEY=VALUE` lines to stdout.
PEM-formatted keys are wrapped in `"""` triple-quote sentinels so they
paste cleanly into Render's secret manager. Run it on each rotation; do
not reuse values across environments.

`.keys/` is in `.gitignore` if you prefer to also keep a local copy.

## 2. Create the Cloudflare R2 bucket

1. Cloudflare Dashboard -> **R2** -> **Create bucket**: `orkora-media`.
2. Click the bucket -> **Settings** -> **Public access** -> **Connect domain**.
   Add a custom subdomain such as `media.orkora.io`. Cloudflare creates the
   CNAME and the bucket is now publicly readable through that hostname.
3. **R2** -> **Manage R2 API Tokens** -> **Create API token**. Permission:
   "Object Read & Write", scoped to the `orkora-media` bucket.
4. Save the **Access Key ID**, **Secret Access Key**, and the **endpoint
   URL** (format: `https://<account-id>.r2.cloudflarestorage.com`). You'll
   paste these into Render in step 4.

## 3. Provision the database

### Option A (recommended): Neon

1. Sign in to [Neon](https://neon.tech). Create a project named `orkora`,
   region eu-central-1.
2. Copy the connection string. It looks like
   `postgresql://USER:PASSWORD@HOST/DB?sslmode=require`.
3. From a local shell, apply the schema once:

   ```bash
   psql "<your-neon-connection-string>" < schema.sql
   psql "<your-neon-connection-string>" < migrations/2026-04-28-add-message-upvotes.sql
   ```

4. Neon supports `pg_uuidv7` natively but our `schema.sql` uses a small
   plpgsql polyfill, so this works with vanilla Postgres 15.

### Option B: Render Postgres (used by `render.yaml`)

If you go this route, leave `BOOTSTRAP_SCHEMA=true` on the API service and
the entrypoint will apply `schema.sql` automatically on first boot. Disable
it after the first successful deploy so future restarts don't try to re-run.

## 4. Deploy the API on Render

1. Render Dashboard -> **New +** -> **Blueprint**.
2. Connect this repo. Render reads `render.yaml` and proposes
   `orkora-api`, `orkora-postgres`, `orkora-redis`.
3. Click **Apply**. Render provisions the resources. The API build runs
   `apps/api/Dockerfile` against the repo root.
4. Open `orkora-api` -> **Environment**. Paste in:
   - `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` (full PEMs, double-quoted)
   - `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
     `S3_BUCKET_MEDIA`, `S3_PUBLIC_BASE_URL` from step 2
   - `POSTMARK_TOKEN` (Postmark Server API token)
   - `EMAIL_FROM_ADDRESS` (a confirmed Postmark sender signature, e.g.
     `no-reply@yourdomain.com`). If unset, defaults to `no-reply@orkora.io`,
     which Postmark will reject unless you own that domain.
   - `LOG_OTP_TO_CONSOLE=true` is an operator break-glass for the rare case
     where the email provider is rejecting sends (Postmark "under review"
     state, SMS provider outage). When on, the OTP code is logged at WARN
     level so it can be retrieved from `render logs` and given to the user
     out-of-band. **Never leave this enabled in real production traffic.**
   - Payment provider keys when you have them: `STRIPE_SECRET_KEY`,
     `STRIPE_WEBHOOK_SECRET`, `PAYSTACK_SECRET_KEY`,
     `PAYSTACK_WEBHOOK_SECRET`, `FLUTTERWAVE_SECRET_KEY`,
     `FLUTTERWAVE_WEBHOOK_SECRET`. The API skips disabled providers
     gracefully so you can launch with one and add the others later.
   - `APP_URL`, `API_URL`, `CORS_ORIGINS`: leave blank for now; fill in
     after step 5.
5. Trigger a manual redeploy after pasting. Watch the build log for
   `[entrypoint] schema is empty; applying schema.sql` (first deploy only)
   and `Nest application successfully started`.
6. Visit `https://orkora-api.onrender.com/health`. You should see
   `{"status":"ok"}`.

After the first successful deploy, change `BOOTSTRAP_SCHEMA` to `false` so
restarts no longer try to apply the schema.

## 5. Deploy the Web on Vercel

1. Vercel Dashboard -> **Add New** -> **Project** -> import this repo.
2. Vercel reads `vercel.json`. Leave **Root Directory** as the repo root.
3. **Settings** -> **Environment Variables**:
   - `NEXT_PUBLIC_API_URL` = `https://orkora-api.onrender.com`
   - `NEXT_PUBLIC_BRAND_NAME` = `Orkora`
   - `NEXT_PUBLIC_APP_URL` = your Vercel URL (set after first deploy)
4. Hit **Deploy**. Vercel builds the web filter via Turborepo and gives
   you a URL like `https://orkora-web.vercel.app`.
5. Back in Render -> `orkora-api` -> Environment:
   - `APP_URL` = the Vercel URL (no trailing slash)
   - `API_URL` = `https://orkora-api.onrender.com`
   - `CORS_ORIGINS` = the Vercel URL plus any custom domains, comma-separated
   - Redeploy the API.

## 6. Wire payment webhooks

For each provider you enabled in step 4, point the provider's webhook
endpoint at the API. The provider URL is the same shape every time; only
the suffix changes.

| Provider     | Webhook URL on Render                                              |
| ------------ | ------------------------------------------------------------------ |
| Stripe       | `https://orkora-api.onrender.com/v1/payments/webhook/stripe`       |
| Paystack     | `https://orkora-api.onrender.com/v1/payments/webhook/paystack`     |
| Flutterwave  | `https://orkora-api.onrender.com/v1/payments/webhook/flutterwave`  |

Stripe: Dashboard -> Developers -> Webhooks -> **Add endpoint**. Subscribe to
these events: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`charge.refunded`, and `charge.refund.updated`. Copy the signing secret it
generates and paste into Render as `STRIPE_WEBHOOK_SECRET`.

Paystack: Dashboard -> Settings -> Webhooks. Enter the URL and save. Paystack
sends `charge.success`, `charge.failed`, and `refund.processed` /
`refund.pending` to the same endpoint; it uses the same secret key as the API,
so no extra env var needed.

Flutterwave: Dashboard -> Settings -> Webhooks. Enter the URL, generate or
choose a secret hash, and paste the same hash into Render as
`FLUTTERWAVE_WEBHOOK_SECRET`. Flutterwave sends `charge.completed` and
`refund.processed` to the same endpoint.

After all three are wired, run a tiny test payment for each provider you
enabled. Confirm the order flips to `paid` in the dashboard, then refund it and
confirm it flips to `refunded`.

### Refund settlement is defence-in-depth

Refunds do not depend on the webhook arriving. When an organizer clicks Refund,
the API asks the provider to refund and, for the common case (card refunds
settle immediately), flips the order to `refunded` synchronously. The
`charge.refunded` / `refund.processed` webhook is the first fallback for slower
(bank-backed) refunds, and a reconciliation sweep (every 10 minutes) is the
second: it re-checks any order with a refund still in flight against the
provider and settles it. So a missed or misconfigured refund webhook degrades
to "settles within ~10 minutes," never "order stuck on `paid` forever."

As a manual escape hatch, the attendee detail page in the dashboard has a
**Re-check** button on every paid order: it asks the provider whether the charge
was refunded and settles the order on the spot. Use it to rescue an order that
was refunded on the provider before this settlement logic existed (the
reconciliation sweep only picks up refunds initiated through the app).

> Note: the Stripe `charge.refunded` event carries the Charge, which does not
> include our `orderId` (that lives on the PaymentIntent). The webhook handler
> retrieves the PaymentIntent to resolve the order, so the event must be
> subscribed for the webhook path to settle a refund on its own.

## 7. Mobile preview on Expo Go

Mobile is not in the stores yet. For preview:

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=https://orkora-api.onrender.com pnpm dev
```

Expo prints a QR. Open Expo Go on your phone, scan, and the app loads
talking to the live API.

For shareable previews, run `pnpm --filter @orkora/mobile exec expo publish`.
For App Store / Play Store builds, switch to EAS:
`pnpm --filter @orkora/mobile exec eas build --platform all`.

## 8. After deploy

Once everything is green:

1. `https://orkora-web.vercel.app/signup` -> create the first owner account.
   The OTP arrives via Postmark (or, if `POSTMARK_TOKEN` is unset, in the
   API logs).
2. Verify the OTP. You land on the dashboard.
3. Dashboard -> Events -> create your first event, add a banner image
   (uploads to R2), publish.
4. Visit the public URL on the mobile preview to see the live agenda.
5. Test a free registration on `/e/<code>/register`. Then a paid one if you
   wired Stripe.
6. Run the check-in flow on `/dashboard/events/<id>/checkin` from a phone
   browser pointed at the camera.

## 9. CI / CD

GitHub Actions workflows live under `.github/workflows/`:

- `ci.yml` runs lint + typecheck + tests on every push and PR.
- `deploy-api.yml` triggers Render's deploy hook on `main`.

After step 4, copy the **Deploy Hook URL** from Render's `orkora-api`
service into a GitHub repo secret named `RENDER_DEPLOY_HOOK_API`. The
deploy workflow already references it. Vercel watches `main` directly.

## 10. Observability

- **Logs**: pino structured JSON, viewable in Render's dashboard.
- **Errors**: set `SENTRY_DSN` to start streaming uncaught exceptions to
  Sentry. The API and web both honour this.
- **Uptime**: Render's `/health` endpoint is hit by the platform every 30s.
  For external monitoring, point UptimeRobot or Better Uptime at the same
  URL.

## Cost expectations

A reasonable production preview costs about **$25 - $40 / month**:

- Render starter web ($7/mo)
- Render Postgres standard ($7/mo) -or- Neon free tier ($0)
- Upstash Redis free tier ($0)
- Cloudflare R2 (~$0.015 per GB stored, no egress fees)
- Vercel Hobby ($0)
- Postmark starter ($0 for 100 emails/month, $15 for 10k)

Scaling beyond that is per-component. Render upgrades to Standard at $25/mo,
Neon scales by compute hour, Vercel Pro at $20/mo unlocks team collab.

## Troubleshooting

**Health check fails on first deploy.**
Check Render logs. The most common failures are:
- Missing `JWT_PRIVATE_KEY` or `JWT_PUBLIC_KEY`. The API refuses to boot.
- `BOOTSTRAP_SCHEMA=true` set against a DB that already has the schema.
  Safe (idempotent) but the entrypoint logs `schema already applied`.
- Wrong `DATABASE_URL`. Confirm the `?sslmode=require` suffix on Neon.

**Web build fails with `Cannot find module @orkora/sdk`.**
Confirm `pnpm-workspace.yaml` is in the repo root and pnpm is the package
manager in Vercel's project settings. It auto-detects from `pnpm-lock.yaml`.

**Mobile cannot reach the API.**
`EXPO_PUBLIC_API_URL` must include the `https://` scheme.

**CORS errors from the web app.**
Render needs `CORS_ORIGINS` set to the exact Vercel URL (no trailing slash).
If you have a custom domain too, add both, comma-separated.

**Webhook from Stripe / Paystack / Flutterwave returns 401.**
Signature mismatch. Double-check the webhook secret in Render matches the
one in the provider dashboard. For Stripe, the secret rotates if you
re-create the endpoint. Re-paste.

**Image upload fails with NoSuchBucket.**
The R2 bucket name in `S3_BUCKET_MEDIA` must match the actual bucket. The
StorageService logs this on boot; check Render logs for the warning.

## Public API for integrators

Organizations can mint API keys from `/dashboard/settings -> API keys`. The
plaintext token is shown once at creation time. Calls authenticate with:

```
Authorization: Bearer ork_<32-char-token>
```

Endpoints currently exposed (read-only, requires `events.read` scope):

| Method | Path                                                  | Notes                                                          |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------- |
| GET    | `/v1/organizations/:orgId/public/events`              | List events. `?status=published` by default. 120 req / min / IP. |
| GET    | `/v1/organizations/:orgId/public/events/:eventId`     | Full event detail (tracks, sessions, speakers, tiers).          |

Response envelope:

```json
{ "data": [...], "meta": { "count": 12 } }
```

Errors:

- `401 Unauthorized` — missing / unknown / revoked key
- `403 Forbidden` — key missing the `events.read` scope
- `404 Not Found` — event id not in the requested org

Scopes available today:

- `events.read`
- `events.write`
- `registrations.read`
- `registrations.write`
- `analytics.read`

A logged-in organizer can also call these endpoints with their JWT; the
same guard chain handles both. Additional endpoints are added by mounting
the `JwtOrApiKeyGuard` and `@RequireScope(...)` decorator on a Nest
handler (see `apps/api/src/modules/events/public-api.controller.ts` for
the canonical example).

## Mobile: EAS build & store submission

The mobile app ships through EAS (Expo Application Services). All config
lives in `apps/mobile/eas.json` and `apps/mobile/app.json`.

### One-time setup

```bash
cd apps/mobile
pnpm install                    # pulls react-native-qrcode-svg + the rest
npx expo install --check        # fixes any version drift Expo flags
npx eas-cli@latest login        # use the orkora Expo account
npx eas-cli init                # writes the projectId; replace the
                                # REPLACE_WITH_EAS_PROJECT_ID placeholders
                                # in app.json + eas.json with the value it
                                # generated
```

After `eas init`, replace the four `REPLACE_WITH_…` tokens:

- `app.json -> expo.updates.url` -> the URL `eas init` printed
- `app.json -> expo.extra.eas.projectId` -> the project id
- `eas.json -> submit.production.ios.appleId` -> Apple ID for App Store Connect
- `eas.json -> submit.production.ios.ascAppId` -> the ASC App ID
- `eas.json -> submit.production.ios.appleTeamId` -> Apple Team ID

For Google Play, drop the service account JSON at
`apps/mobile/google-play-key.json` (gitignored) or rotate the key path.

### Build profiles

| Profile       | Distribution       | API URL                        | Use                               |
| ------------- | ------------------ | ------------------------------ | --------------------------------- |
| `development` | Internal, dev-client | `https://api.dev.orkora.io`     | Day-to-day debugging on a device  |
| `preview`     | Internal (APK + IPA) | `https://api.staging.orkora.io` | Stakeholder review builds         |
| `production`  | Store-ready (AAB + IPA) | `https://api.orkora.io`         | App Store / Play Store submission |

Run a build:

```bash
npx eas-cli@latest build --profile development --platform all
npx eas-cli@latest build --profile production  --platform ios
npx eas-cli@latest build --profile production  --platform android
```

### Store submission

```bash
npx eas-cli@latest submit --profile production --platform ios
npx eas-cli@latest submit --profile production --platform android
```

`appVersionSource: "remote"` keeps the iOS `buildNumber` and Android
`versionCode` in sync across builds. Bump `expo.version` in `app.json`
when the user-visible version changes.

### Smoke test before a build

```bash
pnpm --filter @orkora/mobile smoke   # static API path + dep coverage check
pnpm --filter @orkora/mobile typecheck
```

The `smoke` script (`apps/mobile/scripts/smoke.mjs`) checks deps and that
the API client paths align with shipped Nest controllers. Cheap and
catches the common drift.

## Migrations after the first deploy

Future schema changes ship as SQL files committed under `/migrations/`.
Apply them once per environment:

```bash
# Against Neon (production)
psql "$NEON_PROD_URL" < migrations/2026-MM-DD-name.sql
```

For Render Postgres, open the **Shell** tab on the Postgres resource and
paste the SQL there, or use the `psql` connection string from the Render
dashboard.
