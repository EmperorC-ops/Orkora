# Orkora

**Orchestrate every moment.**

The event platform for organizers who run paid events. Registration, paid checkout, attendee tickets, and live operations in one system. Built for organizers who sell tickets in dollars, naira, cedi, and shillings, side by side.

orkora.events · hello@orkora.events

---

## What it is

Orkora is a single system that takes an event from "we should run something" through to "we ran it" without the organizer stitching together a registration tool, a ticketing tool, a check-in tool, a payment processor, an email tool, a chat tool, and a spreadsheet.

It runs as a fast browser-first dashboard for organizers, a public event page for attendees, an installable PWA + native mobile app for on-the-day operations, and a REST API for partners. Payments land via Stripe, Paystack, and Flutterwave so the same organizer can sell tickets in USD, NGN, GHS, and KES out of the same event.

## Who it's for

- **Corporate conferences** running paid tracks with multiple ticket tiers and group buys.
- **Industry summits** that need a clean public page, real-time attendance numbers, and a polished check-in flow.
- **Private high-value gatherings** where the difference between "this felt expensive" and "this felt cheap" is whether the registration page, ticket email, and door experience all match.

Orkora is *not* aimed at free meetups (Eventbrite + Lu.ma own that surface). The product is built around the constraints that matter to organizers handling money: settlement currency, refunds, reconciliation, tax-ready receipts, and a dashboard that tells them where the cash is.

---

## What it does

### Event setup
- Create events with title, description, banner, location, timezone, public URL slug.
- Configure ticket tiers: general admission, group tickets, paid + free, sale windows, per-order caps, total inventory.
- Build the agenda: tracks, sessions, speakers, live-stream URLs per session.
- Upload banners, speaker avatars, organization logo directly to Cloudflare R2 via signed URLs with a server-side size cap.
- Multi-organization workspace: one user can own or operate multiple orgs, each with its own events, members, payments, and branding.

### Registration + checkout
- Public event pages at `orkora.events/e/<code>` with the agenda, tiers, and registration flow inline. No account required to start.
- Free registration: name + email + ticket type, instant confirmation.
- Paid checkout: hosted by Stripe, Paystack, or Flutterwave depending on the organizer's per-currency preference. Each event auto-routes to the right provider for the buyer's currency.
- Group ticket purchase with attendee detail capture.
- Email confirmation with a tap-to-open ticket link, plus a PDF receipt for paid orders.
- Idempotency on every payment surface so a flaky network never produces a double charge.

### On the day
- **Check-in**: organizer scans the attendee's ticket QR with a phone camera; the dashboard validates the signed token, records the check-in, and updates live counters.
- **Live attendance**: rolling 60-minute attendance chart, registered vs checked-in counters, active sessions, all updating in real time via WebSocket.
- **Live updates**: organizer can push an in-app announcement to every attendee viewing the event home page.
- **Sessions in window**: the public event page surfaces "Join live" CTAs the moment a session begins, with the configured stream URL.
- **PWA on every device**: attendees install the app from the browser; their ticket QR works offline (cached service worker) so venue wifi doesn't matter.

### Payments + money
- Multi-currency: USD, NGN, GHS, KES, with the right provider for each.
- Refunds: organizer-initiated, provider-verified, with a reconciliation job that catches missed webhooks and a manual "re-check" button for stuck refunds.
- Receipts: PDF per paid order, emailed to the attendee at payment time and on refund.
- Audit log: every refund, role change, and admin action recorded with actor, timestamp, request id, and reason.
- Reconciliation sweep runs on schedule, comparing settled-vs-recorded state and surfacing drift to the operator with full per-order context.

### Engagement
- Live chat per event for attendees and organizers, with moderation controls.
- Polls + Q&A scaffolded in (organizer UI in roadmap; mobile parity follows web).
- Speaker pages with photos, bios, session associations.

### Branding + the public face
- Per-org branding (logo, colors via the brand mark) reflected in event pages and ticket emails.
- First-party domain (`orkora.events`) with full SPF, DKIM, DMARC for deliverability.
- Legal pages: ToS, Privacy, Refunds, Organizer Agreement — counsel-ready drafts shipped.

### Partner API
- REST endpoints under `/v1/...` with two ways in: a user JWT (for self-built dashboards) or an API key with explicit scopes (for integrations).
- `events.read` scope live now; further read + write scopes added as partners come on board.
- Webhooks: every Stripe/Paystack/Flutterwave webhook is verified, idempotency-keyed, and recorded for replay.

### Identity + access
- Sign in by email + password, magic-link (OTP to email), Google, or Apple.
- Per-account exponential backoff on bad password attempts (distributed brute-force defense).
- Refresh-token rotation with replay detection: a leaked token used twice revokes the whole family.
- Role-based access at the org level (owner, admin, manager, scanner). Platform-level super-admin scope for Orkora staff with full audit-log visibility.

### Security posture
- TLS everywhere, HSTS, strict CSP with per-request nonce, helmet on the API, double-submit-cookie CSRF on the refresh endpoint.
- JWT signed with RS256 and `kid`-based rotation so the operator can swap signing keys without an outage.
- Argon2 for passwords. Refresh tokens hashed with a server pepper before storage.
- Per-account login throttling, per-destination OTP throttling, per-IP rate limits across the API.
- Tenancy isolation enforced server-side with explicit `WHERE organizationId =` filters on every list/detail query, audited and tested.
- Continuous-audit harness ships dependency CVE scan, secrets scan, browser-bundle leak scan, transport posture check, API authorization abuse tests, and OWASP ZAP baseline. Runs on every push, PR, weekly cron, and manual dispatch. See `SECURITY_AUDIT.md`.

---

## How it's used

### Day-zero (first event)

1. Operator signs up at `orkora.events/signup`, verifies the OTP, lands on the dashboard.
2. Creates an organization (name, currency mix, brand colors).
3. Creates the first event: title, dates, timezone, public slug. Uploads the banner.
4. Adds ticket tiers (general $50, VIP $250, group of 6 $1200), sale windows, total inventory.
5. Adds tracks + sessions + speakers if running a multi-track program.
6. Publishes. The public page at `orkora.events/e/<slug>` is live.

### Day-of-sale

7. Attendees land on the public page, pick a tier, enter holder details, pay via the right provider for their currency. They receive a confirmation email + PDF receipt + tap-to-open ticket link.
8. Organizer watches the dashboard: real-time revenue by currency, registrations by tier, top sources by referrer, daily rollups.

### Day-of-event

9. At the door, scanners (org members with the "scanner" role) open the dashboard on their phone, hit Check-in, point the camera at the attendee's QR code. Valid? Counter ticks up. Already used? Visible warning. Refunded? Voided message.
10. During sessions: live chat for the audience, "Join live" CTA on the public event page when a session is running, attendance chart on the dashboard.
11. After: revenue rolled up, refunds handled per-order with PDF + email, audit log + analytics persist.

### Day-after-the-event

12. Export attendee CSV for sponsors.
13. Reconcile any pending refunds via the manual re-check or wait for the scheduled sweep.
14. Archive the event (keeps the public page reachable, stops new registrations).

### For partners + integrators

15. Operator generates an API key with the scopes they need: `events.read` to list events into a partner directory, `registrations.read` to sync attendees into an external CRM.
16. Partner calls `/v1/organizations/<orgId>/public/events?api_key=ork_...` or uses Bearer auth with the JWT obtained via OAuth-style social login.

---

## Stack

- **API**: NestJS on Render, Postgres on Neon (with PITR), Redis on Upstash, Cloudflare R2 for media.
- **Web**: Next.js 14 on Vercel, App Router, PWA-installable with offline ticket caching.
- **Mobile**: Expo (managed workflow), EAS for release builds, iOS + Android.
- **Payments**: Stripe (USD), Paystack (NGN, GHS), Flutterwave (NGN, GHS, KES). Per-org, per-currency provider preference.
- **Email**: Postmark, with SPF + DKIM + DMARC at the orkora.events apex.
- **Observability**: Sentry on the API + web, structured pino logs in Render, /health + /ready endpoints, scheduled reconciliation jobs surfacing drift.
- **CI**: GitHub Actions for lint, typecheck, test, dependency CVE scan, secrets scan, bundle-leak scan, transport posture, API authorization abuse tests, OWASP ZAP baseline.

## Get started

Sign in at **orkora.events** or email **hello@orkora.events**.

For API access, contact partnerships at the same address.

For security disclosures: **security@orkora.events**.
