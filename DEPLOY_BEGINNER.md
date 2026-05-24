# Deploying Orkora — beginner walkthrough

This is the human-friendly version of `DEPLOY.md`. Assumes you have never
deployed anything before. Each phase says **what you are doing**, **why**,
and **what to click**. Total time: 90 minutes if everything goes smoothly.

---

## What you are building

Five things need to live somewhere on the internet. Each has a host:

| Piece          | What it is                          | Hosted on             |
| -------------- | ----------------------------------- | --------------------- |
| API            | The brain. Talks to everything else.| Render                |
| Database       | Where data is stored.               | Neon (Postgres)       |
| File storage   | Where banner images live.           | Cloudflare R2         |
| Web app        | The dashboard organizers see.       | Vercel                |
| Email          | Sends OTPs and tickets.             | Postmark              |

You'll create a free account on each, copy values between dashboards, and
end up with a live site at `https://something.vercel.app`.

---

## Phase 0: Accounts to create (15 min)

Sign up for these. All have a free tier. Use the same email for each so
password resets are easy.

1. **GitHub** — https://github.com — where the code lives.
2. **Render** — https://render.com — where the API runs. Sign in with GitHub.
3. **Vercel** — https://vercel.com — where the dashboard runs. Sign in with GitHub.
4. **Neon** — https://neon.tech — the database.
5. **Cloudflare** — https://cloudflare.com — file storage.
6. **Postmark** — https://postmarkapp.com — email sending.

Skip Stripe/Paystack/Flutterwave for now; you can launch without them and
wire payments later.

---

## Phase 1: Push the code to GitHub (5 min)

If you haven't already:

1. Make a new private repo on GitHub. Name it `orkora`.
2. In a terminal in the project folder, run:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/orkora.git
   git push -u origin main
   ```
3. Refresh the GitHub page. You should see all the files.

If `git` complains about being already a repo, skip the first three lines.

---

## Phase 2: Generate your secrets (2 min)

The API needs four secret values to sign things securely. There is a
script that mints all of them at once:

```bash
./scripts/rotate-secrets.sh
```

The output looks like:

```
JWT_PRIVATE_KEY="""
-----BEGIN PRIVATE KEY-----
MIIE...
-----END PRIVATE KEY-----
"""
JWT_PUBLIC_KEY="""
-----BEGIN PUBLIC KEY-----
MIIB...
-----END PUBLIC KEY-----
"""
REFRESH_TOKEN_PEPPER=3XQL8TtP1Otw3Ginj2gigWtTK+4A/P8LU4cnPcQC2j4=
TICKET_SIGNING_SECRET=ZGtwDl6jhMWdi90S1CRhuYOAKGGuUsMtIxvgGu2Y8a4=
```

**Copy that whole output into a notes file you keep open.** You'll paste
each line into Render in Phase 6. Do not commit it to GitHub.

If `./scripts/rotate-secrets.sh` says "permission denied", run
`chmod +x scripts/rotate-secrets.sh` first.

---

## Phase 3: Cloudflare R2 (10 min)

R2 is where uploaded images go. Like a public folder on the internet.

1. **Cloudflare dashboard** → click **R2** in the left sidebar → **Create
   bucket** → name it `orkora-media`. Region: Auto.
2. Click the new bucket → **Settings** → scroll to **Public access** →
   **Connect domain**. Enter a subdomain you own such as
   `media.yourdomain.com`. (If you don't own a domain yet, you can use the
   `*.r2.dev` URL Cloudflare gives you, and skip this step.)
3. Click **R2** → **Manage R2 API Tokens** → **Create API token**.
   - Permission: **Object Read & Write**
   - Bucket: `orkora-media`
   - TTL: leave default
4. Cloudflare shows you four values. **Save all of them** in your notes:
   - `Access Key ID` → goes into `S3_ACCESS_KEY_ID`
   - `Secret Access Key` → goes into `S3_SECRET_ACCESS_KEY`
   - `Endpoint` (looks like `https://abc123.r2.cloudflarestorage.com`) → goes into `S3_ENDPOINT`
   - The public URL of your bucket (the custom domain or the `r2.dev` URL) → goes into `S3_PUBLIC_BASE_URL`
5. The bucket name itself goes into `S3_BUCKET_MEDIA` = `orkora-media`.

You will not see the secret access key again, so save it now.

---

## Phase 4: Neon database (5 min)

1. **Neon dashboard** → **Create project**. Name it `orkora`. Region:
   `eu-central-1` (Frankfurt).
2. Neon shows a connection string like
   `postgresql://user:pass@host/db?sslmode=require`. Copy and save it. This
   is your `DATABASE_URL`.

---

## Phase 5: Apply the database schema (3 min)

Neon needs the table layout. You apply it once from your laptop.

Install psql if you don't have it:
- macOS: `brew install postgresql`
- Ubuntu/WSL: `sudo apt install postgresql-client`
- Windows: download from https://www.postgresql.org/download/windows/

Then in the project folder:

**On macOS / Linux / WSL** (uses `<` for input):

```bash
psql 'PASTE_YOUR_NEON_URL_HERE' < schema.sql
psql 'PASTE_YOUR_NEON_URL_HERE' < migrations/2026-04-28-add-message-upvotes.sql
psql 'PASTE_YOUR_NEON_URL_HERE' < migrations/2026-04-28-add-webhook-events.sql
psql 'PASTE_YOUR_NEON_URL_HERE' < migrations/2026-04-28-add-audit-events.sql
psql 'PASTE_YOUR_NEON_URL_HERE' < migrations/2026-05-04-add-api-keys-and-provider-prefs.sql
```

**On Windows PowerShell** (uses `-f` because PowerShell doesn't support
`<` redirection):

```powershell
psql 'PASTE_YOUR_NEON_URL_HERE' -f schema.sql
psql 'PASTE_YOUR_NEON_URL_HERE' -f migrations6-04-28-add-message-upvotes.sql
psql 'PASTE_YOUR_NEON_URL_HERE' -f migrations6-04-28-add-webhook-events.sql
psql 'PASTE_YOUR_NEON_URL_HERE' -f migrations6-04-28-add-audit-events.sql
psql 'PASTE_YOUR_NEON_URL_HERE' -f migrations6-05-04-add-api-keys-and-provider-prefs.sql
```

Use **single quotes** around the connection string. PowerShell expands `$`
and `@` inside double quotes and that mangles passwords / URLs.

If each command prints a list of `CREATE TABLE` lines and exits without
errors, you're done. Take the connection string out of your shell history
afterwards (`history -c` on bash) since it has a password in it.

---

## Phase 6: Deploy the API on Render (15 min)

This is the brain.

1. **Render dashboard** → **New +** → **Blueprint**.
2. Connect your GitHub repo. Render reads `render.yaml` and proposes
   `orkora-api`, `orkora-postgres`, `orkora-redis`. **You don't need
   `orkora-postgres`** because you're using Neon. Uncheck it if Render
   lets you, or just delete it after creation. **Apply.**
3. Wait for the resources to provision (about 2 minutes).
4. Click `orkora-api` → **Environment** tab → **Add environment variable**
   for each of the following:

   **From Phase 2 (your secrets):**
   - `JWT_PRIVATE_KEY` — the full PEM block, double-quoted
   - `JWT_PUBLIC_KEY` — the full PEM block, double-quoted
   - `REFRESH_TOKEN_PEPPER`
   - `TICKET_SIGNING_SECRET`

   **From Phase 3 (Cloudflare):**
   - `S3_ENDPOINT`
   - `S3_ACCESS_KEY_ID`
   - `S3_SECRET_ACCESS_KEY`
   - `S3_BUCKET_MEDIA` = `orkora-media`
   - `S3_PUBLIC_BASE_URL`

   **From Phase 4 (Neon):**
   - `DATABASE_URL`

   **From Postmark:**
   - Create a Postmark **Server** → copy the **Server API Token**
   - `POSTMARK_TOKEN` = that token
   - `EMAIL_FROM_ADDRESS` = an email on a domain you've verified in Postmark

   **Leave blank for now (you'll fill these in Phase 8):**
   - `APP_URL`
   - `API_URL`
   - `CORS_ORIGINS`

5. Click **Manual Deploy** → **Deploy latest commit**. Watch the build.
   Look for the line `Nest application successfully started`. If you see
   a red error, check the troubleshooting section at the bottom of
   `DEPLOY.md`.
6. Once deployed, the API URL is `https://orkora-api.onrender.com` (or
   similar — Render shows the exact URL on the service page). Visit
   `https://YOUR-API-URL/health`. You should see `{"status":"ok"}`.
7. Once that's working, go back to Environment and set
   `BOOTSTRAP_SCHEMA=false` so future restarts don't try to re-apply the
   schema. Redeploy.

---

## Phase 7: Deploy the web on Vercel (5 min)

1. **Vercel dashboard** → **Add New** → **Project** → import the GitHub
   repo.
2. Vercel autodetects pnpm and reads `vercel.json`. **Don't change the
   Root Directory.**
3. Before you click Deploy, expand **Environment Variables** and add:
   - `NEXT_PUBLIC_API_URL` = the Render API URL from Phase 6
     (`https://orkora-api.onrender.com`)
   - `NEXT_PUBLIC_BRAND_NAME` = `Orkora`
4. Click **Deploy**. Wait 2–3 minutes. You'll get a URL like
   `https://orkora-web.vercel.app`. Save it.

---

## Phase 8: Connect API and web (3 min)

The API needs to know where the web lives, and that the web is allowed to
talk to it.

1. **Render dashboard** → `orkora-api` → **Environment**:
   - `APP_URL` = your Vercel URL (no trailing slash)
   - `API_URL` = your Render API URL
   - `CORS_ORIGINS` = your Vercel URL (and any custom domain, comma-separated)
2. Redeploy the API.

Also go back to Vercel → your project → **Environment Variables** and add:
   - `NEXT_PUBLIC_APP_URL` = your Vercel URL

Redeploy the web (Vercel does this automatically when you save the env
var).

---

## Phase 9: First sign-in test (5 min)

1. Open your Vercel URL in a browser.
2. Click **Sign up**. Enter an email + a password.
3. The OTP code arrives by email (Postmark). If you don't see one, check
   the Render API logs — in dev mode the OTP is printed there.
4. Enter the OTP. You land on the dashboard.
5. **Events** → **New event** → fill it in → upload a banner. The image
   uploads to R2; if the upload fails, recheck Phase 3.
6. **Publish**. Copy the share link. Open it in an incognito window. You
   should see the public event page.
7. **Register** as a test attendee. You should land on a confirmation
   page and get a ticket QR.

If any of these break, the **Troubleshooting** section in `DEPLOY.md` lists
the common causes.

---

## Phase 10 (optional): Wire payments

Skip if you only want a free-RSVP launch.

For each provider you want, do steps 4 and 5 from `DEPLOY.md` section 4
(add the secret env vars on Render) and section 6 (point the provider's
webhook at `https://YOUR-API-URL/v1/payments/webhook/<provider>`).

After wiring, run a small real-money test through `/e/<code>/register`,
choose the paid tier, complete checkout. The order should flip from
`pending` to `paid` in the dashboard within 10 seconds.

---

## Phase 11 (optional): Mobile preview

Anyone with the Expo Go app on their phone can use the mobile app today
without a store listing.

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=https://YOUR-RENDER-API-URL pnpm dev
```

Expo prints a QR code in the terminal. Open Expo Go on your phone, scan,
and the app loads, talking to your live API.

To put the app on the App Store / Play Store: follow the
**Mobile: EAS build & store submission** section in `DEPLOY.md`. It needs
an Apple Developer account ($99/year) and a Google Play account ($25
one-time).

---

## Phase 12: Hand-off & monitoring (one-time)

1. **GitHub repo settings** → **Secrets and variables** → **Actions** →
   add `RENDER_DEPLOY_HOOK_API` with the Deploy Hook URL from Render
   (`orkora-api` → **Settings** → **Deploy Hook**). Pushes to `main` now
   redeploy the API automatically.
2. **Sentry** (optional but recommended): make a Sentry project, paste
   `SENTRY_DSN` into Render → redeploy. Errors stream there.
3. **Uptime ping** (optional): point UptimeRobot at
   `https://YOUR-API-URL/health` to get an SMS when the API goes down.

---

## You're live

The whole system runs about $0–$15 per month on free tiers and the
Postmark starter. As soon as paid traffic shows up, upgrade Render to
the $7 web service and Postmark to the $15 plan.

When you ship a code change:
1. `git push origin main`
2. Render and Vercel both redeploy automatically.
3. New schema changes go in `migrations/`. Run them with
   `psql "$NEON_URL" < migrations/<file>.sql` from your laptop.

Anything in `DEPLOY.md` that this guide skipped is for advanced cases. If
something here doesn't work, that file has the exact technical version of
the same step.
