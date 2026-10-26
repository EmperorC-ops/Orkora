# Signup and outbound abuse hardening, October 2026

Phase 2 of the signup-abuse work. Phase 1 was the read-only audit. This document records what changed, the caps in force, the environment variables, and what is left.

The threat: anyone on the internet making Orkora send email or SMS to addresses they choose, with text they choose, from our domain. That burns Postmark reputation and money, and can get the sending domain blocked.

## The four rules

1. **No attacker text in a subject line.** Ticket, receipt, refund and invite subjects are fixed strings. OTP and collision-notice subjects carry no user input. Campaign subjects are the organizer's own copy, forced onto one line; recipient names placed into them are cleaned first.
2. **Names, titles and venues are cleaned in every email body.** `sanitizeForEmail` drops invisible characters, removes links and web addresses, and caps the length. It is applied when rendering, so records saved before this change are covered too.
3. **Names cannot be adverts at the door.** Person names (signup, registration, VIP), organization names, event titles, venue name and address lines, and ticket type names are refused if they contain links, web addresses, phone numbers or messaging handles (and, for people and organizations, emoji; brand signs such as the trademark sign are allowed). Names written without a space after a dot ("Mrs.Idowu", "St.Columba") and titles such as "Owambe Night @Eko Hotel" or "Signal: The Future of Fintech" pass. Only a changed value is checked on update, so an older value never blocks unrelated edits.
5. **No organizer-chosen link in a ticket email.** "Join online" opens the attendee's own ticket page, which shows the organizer's join link. Anyone can type a stranger's address into a registration form, so an organizer URL in our email would be a phishing channel.
4. **One plain recipient and a one-line subject on every send.** `assertSafeEnvelope` runs in the Postmark and console email providers and in the campaign Postmark calls. A list, a display name or a header break is refused before any provider is called.

## What changed, by surface

| Surface | Before | Now |
|---|---|---|
| `POST /auth/otp/send` | Anonymous, email or SMS, four purposes, destination unchecked | Email only, `signup` and `login` only, one plain address. Per inbox (Gmail dots and "+tags" folded) 8 an hour and 20 a day across both purposes, counted atomically; 60 per client network an hour (an IPv6 /48 gets 240); its share of the global cap; kill switch; Turnstile; honeypot |
| `POST /auth/login` (unverified account) | Sent a fresh code with no network cap | Same caps as above, including the caller's network |
| `POST /auth/signup` | Any name; collision notice on every repeat | Name rule, Turnstile, honeypot, signup volume alert, collision notice at most once per address per day (skipped silently, the response never changes) |
| Free and VIP registration | Any holder name, uncapped emails | Name rule for every holder, 120 registrations per client network per hour (429; an IPv6 /48 gets 480), at most 5 ticket emails per inbox per hour (skipped, the registration still succeeds), global cap, Turnstile, honeypot |
| Ticket email template | Event title in subject, `joinUrl` unescaped | Fixed subject, cleaned body text (links, phone numbers and handles removed), no organizer link: "Join online" opens the ticket page, ticket links escaped |
| Invites | Org name in subject, uncapped | Fixed subject, 30 per organization per day, 30 per inviter per day, 3 per address per day, counted before any write |
| Campaign test send | Any address, any From | Only to verified members of the organization, sender must be verified, 20 per sender per day |
| Campaign From | Free-form name and address | Always our own address (`EMAIL_FROM_ADDRESS`, default `no-reply@orkora.events`); display name cleaned and shown as "Name via Orkora"; Reply-to must be one plain address |
| Campaign audience | Every registration, including unpaid pending ones | Confirmed registrations only |
| Campaign send | Status check then update (two tabs could both send); cap counted `sentAt` | Atomic claim with `updateMany` on status; organization cap counted by `queuedAt`; an organization younger than 14 days gets 200 a day; 2000 recipients per sender per day and 20000 platform-wide per day; malformed recipients marked failed and never sent; refused while the kill switch is on |
| Resend confirmations | Uncapped | 3 real resends per event per day and 10 per organization per day; each email counts against the global cap and at most 3 a day per inbox (skipped ones are reported); dry runs are free; refused while the kill switch is on |
| SMS providers | Any number | E.164 in an allowed country only (`SMS_ALLOWED_COUNTRY_CODES`, default 234, 233, 254, 27). Nothing sends SMS today; this is a backstop |
| Rate-limit keys | Leftmost `X-Forwarded-For` (spoofable) | `req.ip` with Express `trust proxy` set to `TRUST_PROXY_HOPS`; IPv6 keyed on its /64 |

Counters live in Redis when `REDIS_URL` works (shared across instances and restarts) and in process memory otherwise. They use their own `obc:` key prefix and never touch login lockout. If Redis is configured but unreachable, counts fall back to the process, every cap is halved and one Sentry warning is raised. It does not fail closed, because that would take signup and sign-in down whenever Redis blips.

Each send kind may use only a share of the global hourly cap (sign-in codes 35%, ticket emails 35%, resends 15%, collision notices 5%, invites 5%, test sends 5%; the shares add up to 100%), so a flood of one kind cannot starve the others.

No schema change. No migration.

## Environment variables

API (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `OUTBOUND_SENDS_DISABLED` | unset | `1` stops every outsider-triggered email and SMS |
| `OUTBOUND_GLOBAL_HOURLY_CAP` | 3000 | Shared hourly cap across OTP, notices, ticket emails, invites and test sends |
| `OUTBOUND_ALERT_HOURLY` | 1000 | Sentry warning once when the hourly count reaches this |
| `SIGNUP_ALERT_HOURLY` | 100 | Sentry warning once when signups per hour reach this |
| `TURNSTILE_SITE_KEY` | unset | Turnstile is enforced only when both keys are set |
| `TURNSTILE_SECRET_KEY` | unset | As above |
| `TURNSTILE_ALLOWED_HOSTNAMES` | unset | Extra hostnames a token may come from; `APP_URL`'s host and its www form are always allowed |
| `CAMPAIGNS_NEW_ORG_DAYS` | 14 | How long an organization counts as new |
| `CAMPAIGNS_NEW_ORG_DAILY_CAP` | 200 | Daily campaign recipients for a new organization |
| `CAMPAIGNS_USER_DAILY_CAP` | 2000 | Daily campaign recipients per sender, across organizations |
| `CAMPAIGNS_GLOBAL_DAILY_CAP` | 20000 | Daily campaign recipients platform-wide |
| `TRUST_PROXY_HOPS` | 1 | Proxies in front of the API. Render is 1. Set 2 if Cloudflare proxies `api.orkora.events` |
| `SMS_ALLOWED_COUNTRY_CODES` | 234,233,254,27 | Calling codes SMS may go to |

Web:

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Shows the Turnstile widget on signup, the sign-in code request, the code resend, registration and VIP registration. Leave unset until the API has both keys |

The CSP in `apps/web/middleware.ts` now allows `https://challenges.cloudflare.com` in `script-src`, `frame-src` and `connect-src`.

## Turning Turnstile on (owner steps)

1. In Cloudflare, create a Turnstile widget for `orkora.events` and `www.orkora.events` (managed mode).
2. On Render (API), set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Deploy.
3. On Vercel (web), set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the same site key. Redeploy (the value is baked in at build time).
4. Sign up and request a sign-in code once each to confirm.

Order matters: API first. If the web shows the widget before the API knows the keys, nothing breaks (the API ignores the token). If the API has the keys before the web shows the widget, every signup and registration is refused.

The Expo mobile app has no Turnstile. It has no store release, but once Turnstile is on, its signup and sign-in code requests will be refused until it gains a Turnstile web view.

## Deploy order

The web only sends `captchaToken` when a site key is set and `hpField` (the honeypot) when a bot fills it, so a web deploy before the API is safe. Ship the API first anyway.

## Tests

New specs: `common/outbound/outbound.spec.ts` (guard, IP keys, Turnstile, envelope, SMS, invites), `common/outbound/text-safety.spec.ts`, `modules/auth/auth-abuse.spec.ts`, `modules/registrations/registrations-abuse.spec.ts`, `modules/campaigns/campaigns-abuse.spec.ts`, and new cases in `modules/notifications/templates.spec.ts`. Existing specs were updated where behaviour changed (campaign test send now needs a verified member; send claim uses `updateMany`).

## Left open

- A determined attacker can still register addresses to their own free event (capped, behind Turnstile, and each victim gets a ticket email they did not ask for) and later mail them a campaign within the new-organization allowance. Manual review before an organization's first campaign is the next step if this is abused.
- A domain written in title case ("Cheap.Casino") is not treated as a link, so that names like "St.Columba" pass. Some mail clients may still link it.
- Turnstile is off until both keys are set; the API logs a warning at boot in production until then. Every public send path relies on it.
- Login on an unverified account still sends a code without a CAPTCHA. It is capped per network and per inbox like any other code.
- Lowercase names written with a dot and no space ("mrs.idowu", "Node.js Lagos Meetup") are refused, the price of catching lowercase domains on any TLD.
- With `REDIS_URL` unset, counters are per process; running more than one API instance multiplies every cap.
- The independent re-check also listed: bare "@handle" in venue and ticket names, slash-separated phone numbers, long digit runs in titles ("10000 Runners") refused as phone numbers, Turnstile tokens not tied to a form action, and the existing 10-a-minute throttle on registration for a single venue Wi-Fi.
- A campaign Reply-to cannot be cleared once set (the web omits an empty value). Low impact.
- The Phase 1 purge question (fix 9, existing junk accounts) waits on the read-only SQL the owner runs.
