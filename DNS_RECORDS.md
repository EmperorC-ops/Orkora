# Orkora DNS + Email Setup (orkora.events)

**Last updated:** 2 June 2026
**Audience:** the operator (you), at the registrar / DNS console.
**Goal:** point orkora.events at Vercel (web) and Render (API), set up authenticated email, enforce DMARC after a soft warm-up.

This is the literal record set. Paste it into Cloudflare DNS (or your registrar's equivalent) row by row.

---

## Part 1 — Buy the domains

**Primary:** `orkora.events` — at Cloudflare Registrar (at-cost, no upsells) or Namecheap. ~$30 to $40/year.

**Defensive (highly recommended, ~$25/year combined):**
- `orkora.org` — register, 301-redirect to orkora.events.
- `orkora.net` — register, 301-redirect to orkora.events.

**Backorder for the future:**
- `orkora.com` — set a backorder at your registrar so you grab it if it ever drops.

After purchase, change the nameservers on each domain to Cloudflare's (free DNS, fastest TTL behavior). For the defensive domains, point them at Cloudflare too so you can manage the 301 redirects from the dashboard's Page Rules / Bulk Redirects.

---

## Part 2 — Core DNS records for orkora.events

| Type | Name | Content | TTL | Proxy | Purpose |
|---|---|---|---|---|---|
| `A` | `@` | `76.76.21.21` | Auto | Proxied | Apex points to Vercel's Anycast IP. Cloudflare proxy adds DDoS + caching. |
| `CNAME` | `www` | `cname.vercel-dns.com` | Auto | Proxied | www subdomain points to Vercel. |
| `CNAME` | `api` | `<orkora-api>.onrender.com` | Auto | DNS-only | API host on Render. Render terminates TLS; do NOT proxy through Cloudflare (Render handles cert directly). Replace `<orkora-api>` with your actual Render service hostname. |
| `CNAME` | `cdn` | `<r2-public>.r2.dev` | Auto | Proxied | Public R2 bucket for banners and uploads. Replace `<r2-public>` with the bucket's public hostname. |
| `CNAME` | `media` | `<r2-public>.r2.dev` | Auto | Proxied | Alternate alias for the same R2 bucket if separate brand uses need it. Optional. |

**After you add the apex A and www CNAME**, go to Vercel → Project Settings → Domains and add `orkora.events` and `www.orkora.events`. Vercel verifies via DNS automatically.

**After you add the api CNAME**, go to Render → Service Settings → Custom Domains and add `api.orkora.events`. Render issues a cert via Let's Encrypt within a few minutes.

---

## Part 3 — Email authentication (SPF, DKIM, DMARC)

These records authorise Postmark (or whichever transactional email provider you use) to send mail as `@orkora.events`, and stop spammers from spoofing the domain.

### SPF

| Type | Name | Content |
|---|---|---|
| `TXT` | `@` | `v=spf1 include:spf.mtasv.net ~all` |

This authorises Postmark (`spf.mtasv.net`) to send for orkora.events. The `~all` is a soft-fail, which is the right posture during warm-up. Tighten to `-all` after DMARC is enforced.

If you also send from Google Workspace (e.g. hello@orkora.events through Gmail), append the Google include:

```
v=spf1 include:_spf.google.com include:spf.mtasv.net ~all
```

### DKIM (Postmark)

Postmark gives you a DKIM CNAME at signup. It looks like:

| Type | Name | Content |
|---|---|---|
| `CNAME` | `<postmark-prefix>._domainkey` | `<postmark-prefix>.dkim.mtasv.net` |

Get the exact prefix from Postmark → Servers → Settings → DKIM. There may be a second selector — paste both.

### DKIM (Google Workspace, if used)

Google gives you a similar CNAME in Admin → Apps → Gmail → Authenticate email:

| Type | Name | Content |
|---|---|---|
| `TXT` | `google._domainkey` | `v=DKIM1; k=rsa; p=<long key from Google>` |

### Return-Path (Postmark)

| Type | Name | Content |
|---|---|---|
| `CNAME` | `pm-bounces` | `pm.mtasv.net` |

Postmark uses `pm-bounces.orkora.events` as the Return-Path, which aligns SPF for stronger DMARC.

### DMARC

Start permissive, then tighten over a four-week warm-up. The reporting addresses let you watch for spoofing attempts.

**Week 1 to 2 — observe only:**

| Type | Name | Content |
|---|---|---|
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@orkora.events; ruf=mailto:dmarc@orkora.events; pct=100; adkim=s; aspf=s` |

**Week 3 — quarantine on failure:**

```
v=DMARC1; p=quarantine; rua=mailto:dmarc@orkora.events; ruf=mailto:dmarc@orkora.events; pct=100; adkim=s; aspf=s
```

**Week 4 onward — full enforcement:**

```
v=DMARC1; p=reject; rua=mailto:dmarc@orkora.events; ruf=mailto:dmarc@orkora.events; pct=100; adkim=s; aspf=s
```

You will need `dmarc@orkora.events` to exist (forward it to your ops inbox; or use a free aggregator like Postmark DMARC Digests, dmarcian, or Valimail).

---

## Part 4 — Brand-protection records

### MX (so the domain accepts inbound mail)

If you use Google Workspace:

| Type | Name | Content | Priority |
|---|---|---|---|
| `MX` | `@` | `smtp.google.com` | 1 |

If you use Postmark for inbound (less common), Postmark publishes the values to use.

If you do not use email yet but want to lock the domain, you can publish a "null MX" to explicitly refuse mail:

| Type | Name | Content | Priority |
|---|---|---|---|
| `MX` | `@` | `.` | 0 |

A null MX (`.` with priority 0) explicitly tells receivers there is no mail server, so receivers reject spoofed bounces faster.

### CAA — only Let's Encrypt and Sectigo can issue certs

| Type | Name | Content |
|---|---|---|
| `CAA` | `@` | `0 issue "letsencrypt.org"` |
| `CAA` | `@` | `0 issue "sectigo.com"` |
| `CAA` | `@` | `0 issuewild "letsencrypt.org"` |

This prevents a third-party CA from issuing a cert for orkora.events even if an attacker compromises a DNS provider in the chain. Vercel uses Let's Encrypt; Render uses Let's Encrypt; Cloudflare uses Sectigo for its own edge cert.

### MTA-STS (optional, advanced)

If you set up Google Workspace email, publish an MTA-STS policy so receivers only accept mail over TLS. Skip for now; revisit when you cross 100 organizers.

---

## Part 5 — Redirect orkora.org and orkora.net to orkora.events

Once those defensive domains are on Cloudflare, set up a **Bulk Redirect** (free tier):

- Source: `orkora.org/*` → Target: `https://orkora.events/$1`, status 301, preserve query.
- Source: `orkora.net/*` → Target: `https://orkora.events/$1`, status 301, preserve query.

Cloudflare handles the cert for the source domains automatically (Universal SSL).

---

## Part 6 — Application config to update after DNS propagates

The codebase has been swapped from orkora.io to orkora.events. After the DNS records resolve, set these on the hosting providers:

### Vercel project (web)

Environment variables:

```
NEXT_PUBLIC_APP_URL = https://orkora.events
NEXT_PUBLIC_API_URL = https://api.orkora.events
```

Add the domain in Vercel → Project → Domains.

### Render service (API)

Environment variables:

```
APP_URL          = https://orkora.events
CORS_ORIGINS     = https://orkora.events,https://www.orkora.events
EMAIL_FROM_ADDRESS = no-reply@orkora.events
```

Add the custom domain `api.orkora.events` in Render → Service → Custom Domains.

### Stripe webhook destination

In Stripe Dashboard → Developers → Webhooks, edit your endpoint URL from the old host to:

```
https://api.orkora.events/v1/webhooks/stripe
```

Same for Paystack and Flutterwave webhook configs.

### Mobile EAS env (already updated in apps/mobile/eas.json)

The eas.json now points production to `https://api.orkora.events`. Next `eas build --profile production` ships with the new URL baked in.

---

## Part 7 — Verification checklist

After DNS propagates (typically 5 to 30 minutes with Cloudflare):

- [ ] `dig orkora.events A +short` returns Vercel's IP.
- [ ] `dig api.orkora.events CNAME +short` returns your Render hostname.
- [ ] `dig orkora.events TXT +short` includes your SPF record.
- [ ] `dig _dmarc.orkora.events TXT +short` returns your DMARC record.
- [ ] Browse to `https://orkora.events` — Vercel-hosted site loads.
- [ ] Browse to `https://api.orkora.events/health` — Render API returns `{"status":"ok"}`.
- [ ] Send a test email from Postmark addressed to a Gmail account — passes SPF + DKIM + DMARC (view "Show original" in Gmail to confirm).
- [ ] Send a paid checkout webhook in Stripe test mode — webhook hits api.orkora.events and settles the order.
- [ ] Open `https://orkora.events/legal/privacy` — every email and URL in the doc renders as orkora.events (not orkora.io).
- [ ] Run mxtoolbox.com against orkora.events — no "blacklisted" findings, SPF + DKIM + DMARC all green.

---

## Part 8 — When to delete this doc

Once the domain is live, all checklist items are green, and the team has internalised the values, archive this doc to `docs/archive/` for reference. It will be useful again when you stand up the staging domain (`staging.orkora.events`) or migrate email providers.
