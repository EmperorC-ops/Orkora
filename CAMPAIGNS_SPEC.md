# Campaigns module — PR-ready spec

Organizer-initiated email campaigns: composer, audience builder, segmented sends, drip triggers. The piece that closes Orkora's biggest gap vs Eventbrite's marketing surface.

This doc is the spec. Implementation of Slice A ships alongside this doc as a real working feature; Slices B / C / D are scoped here and held until after public launch.

---

## Problem

Today the system sends only transactional emails (OTP, ticket confirmation, receipt, refund). Organizers have no way to send their own emails to their registrants. They have to export a CSV, paste into Mailchimp, and stitch the lists together themselves. They asked. Eventbrite has it. We don't.

## Outcome

After Slice A, an organizer can:

1. Open `dashboard/campaigns`, click "New campaign".
2. Pick the audience (all registrants for an event, or a smart segment).
3. Write subject, preview text, and body. Drop in personalization tokens.
4. Send a test to themselves.
5. Send now to the audience, or schedule for later.
6. See open + click rates roll up on the campaign list.

Compliance: every campaign carries a one-click unsubscribe link; bounce + complaint webhooks auto-suppress the recipient on future sends.

---

## Data model

Three new Postgres tables, all tenancy-scoped at `organization_id`. Schema lives in `apps/api/prisma/schema.prisma`; the forward-only SQL is `apps/api/migrations/0005_campaigns.sql`.

```
campaigns
  id                uuid pk default uuidv7()
  organization_id   uuid fk -> organizations.id
  event_id          uuid fk -> events.id  nullable
  name              text                  organizer-facing label
  subject           text
  preview_text      text                  inbox preview snippet
  body_html         text                  rendered HTML (we wrap in template)
  body_markdown     text                  source of truth, organizer edits this
  from_name         text                  e.g. "Tech Summit Team"
  from_email        text                  authenticated sender on Postmark
  reply_to          text  nullable
  status            text   enum(draft|scheduled|sending|sent|cancelled|failed)
  send_mode         text   enum(now|scheduled|triggered)
  scheduled_at      timestamptz nullable  when send_mode=scheduled
  trigger_spec      jsonb       nullable  when send_mode=triggered (Slice C)
  audience_id       uuid fk -> campaign_audiences.id
  created_by_id     uuid fk -> users.id
  created_at        timestamptz default now()
  sent_started_at   timestamptz nullable
  sent_completed_at timestamptz nullable
  recipient_count   integer default 0
  index   (organization_id, status, scheduled_at)
  index   (organization_id, event_id)

campaign_audiences
  id                uuid pk default uuidv7()
  organization_id   uuid fk -> organizations.id
  event_id          uuid fk -> events.id  nullable    scope a segment to one event or null = org-wide
  name              text                              organizer label
  kind              text   enum(smart|custom)
  smart_key         text   nullable                   for kind=smart, e.g. all-registrations|checked-in|tier-x
  custom_spec       jsonb  nullable                   for kind=custom, the AND'd conditions
  cached_count      integer default 0
  cached_at         timestamptz nullable
  created_by_id     uuid fk -> users.id
  created_at        timestamptz default now()
  index   (organization_id, kind)
  index   (organization_id, event_id)

campaign_sends
  id                  uuid pk default uuidv7()
  campaign_id         uuid fk -> campaigns.id
  organization_id     uuid fk -> organizations.id    (denormalised for tenant queries)
  user_id             uuid fk -> users.id  nullable  (null if the recipient is not yet an Orkora user)
  recipient_email     text
  recipient_name      text  nullable
  status              text   enum(queued|sent|delivered|bounced|opened|clicked|unsubscribed|complained|failed)
  postmark_message_id text  nullable
  queued_at           timestamptz default now()
  sent_at             timestamptz nullable
  delivered_at        timestamptz nullable
  first_opened_at     timestamptz nullable
  first_clicked_at    timestamptz nullable
  bounced_at          timestamptz nullable
  unsubscribed_at     timestamptz nullable
  unique  (campaign_id, recipient_email)
  index   (organization_id, status)
  index   (postmark_message_id)

(reusing) suppression_list
  email + reason (bounce|complaint|unsubscribe) + organizationId (so an unsub on Org A does not gag Org B)
```

`campaign_sends (campaign_id, recipient_email)` unique = idempotency. If the worker re-runs a chunk after a partial failure, dupes can't fire. Same pattern as `notification_log` for refunds.

`campaign_audiences.cached_count` updates on each preview + every 5 minutes via a scheduled job (Slice A: lazy; Slice B: scheduled).

---

## API surface

All routes under `/v1/organizations/:orgId/...` so the existing tenancy interceptor applies. New scope `campaigns.write` for API-key access; existing JwtOrApiKeyGuard handles the rest.

```
GET    /v1/organizations/:orgId/campaigns              list, paginated, sortable
POST   /v1/organizations/:orgId/campaigns              create (draft state)
GET    /v1/organizations/:orgId/campaigns/:id          full detail incl. send rollup
PATCH  /v1/organizations/:orgId/campaigns/:id          edit while in draft|scheduled
DELETE /v1/organizations/:orgId/campaigns/:id          delete while in draft
POST   /v1/organizations/:orgId/campaigns/:id/test-send  body: { email }
POST   /v1/organizations/:orgId/campaigns/:id/send       fire now
POST   /v1/organizations/:orgId/campaigns/:id/schedule   body: { scheduledAt }
POST   /v1/organizations/:orgId/campaigns/:id/cancel     cancel scheduled before fire

GET    /v1/organizations/:orgId/audiences              list smart + custom
POST   /v1/organizations/:orgId/audiences              create custom
GET    /v1/organizations/:orgId/audiences/:id/preview  live count + 10 sample rows
POST   /v1/organizations/:orgId/audiences/:id/refresh  re-cache count

POST   /v1/webhooks/postmark                           delivered/bounced/opened/clicked/unsubscribed/complained
POST   /v1/me/unsubscribe/:token                       one-click, no auth, CAN-SPAM compliant
```

Postmark webhook is dedicated (not multiplexed with payment webhooks). Signed via `POSTMARK_WEBHOOK_SECRET`; mirrors the per-provider verifier pattern we already use for Stripe/Paystack.

Unsub token is HMAC-SHA256 of `(send_id, recipient_email, server pepper)`. One-click works without account login.

---

## UI surfaces

Three new web routes under `apps/web/app/(organizer)/dashboard/campaigns/`:

1. `page.tsx` — campaign list table. Columns: Name, Audience (with size), Sent count, Open % · Click %, Status pill. New Campaign button top-right.
2. `new/page.tsx` — composer: subject + preview + body editor + audience picker + send-mode tabs (Now | Schedule | Trigger). Side rail holds metadata. Test-send button + Review button.
3. `[id]/page.tsx` — campaign detail: same composer for editing drafts, send rollup for already-sent campaigns (open rate, click rate, bounce rate, recipient table).

Audience builder appears as a modal panel from inside the composer, not its own route — it always exists to pick an audience for a campaign.

Mockups: see the conversation's screen set rendered alongside this doc; mockup pixel positions can shift, info architecture is locked.

---

## Slice A — what ships now (alongside this doc)

| Capability | Scope |
|---|---|
| Schema + migration | All three tables + indexes + unique constraints |
| API | list, create, get, patch (subject/body only), send-now, test-send, postmark webhook (delivered/bounced/opened/clicked), unsubscribe |
| Audiences | only the smart segment `all-registrations-for-event-X`; custom builder deferred |
| Send pipeline | BullMQ `campaign:send` job materialises recipients in chunks of 500, calls Postmark batch endpoint, writes campaign_sends rows |
| Personalization | `{{first_name}}`, `{{event_title}}`, `{{ticket_url}}` tokens swapped per recipient |
| Compliance | one-click unsubscribe link auto-appended, suppression list honoured at send time |
| Web | campaigns list + new-campaign composer + review screen + send confirmation |
| Tests | Jest specs for service.create, service.send, postmark webhook idempotency, unsubscribe-token validation |

Acceptance:
- Organizer creates a campaign, sends to themselves as test, then sends to all 1,300 registrants of their event.
- 1,300 `campaign_sends` rows land within 5 minutes.
- 1,300 Postmark webhooks come back, each rewrites the corresponding row's status.
- Campaign list shows correct counters.
- Recipient clicks unsubscribe link, lands on a public page that confirms unsubscribe, future campaigns to that email skip.

---

## Slices B / C / D (parked)

### Slice B — segments + scheduled sends (~4 days)
- Custom audience builder UI + AND-row engine
- Smart segments: `checked-in`, `not-checked-in`, `tier:<id>`, `attended-event:<id>`, `did-not-attend:<id>`, `refunded`
- Scheduled-send dispatcher (cron + queue with `scheduledAt <= now()`)
- Cancel-before-send

### Slice C — drip triggers (~4 days)
- `trigger_spec` JSON: `{ kind: 'after_event_end', offset: 'P1D' }` or `{ kind: 'before_session_start', offset: 'PT1H' }`
- Triggered-campaign worker reacts to event lifecycle events
- Abandoned-checkout trigger (registration without payment after N hours)

### Slice D — domain authentication wizard (~3 days)
- Per-org "Connect your domain" flow: paste DNS records, verify SPF + DKIM + DMARC, Postmark sender signature provisioned per org
- Pre-launch deliverability score (warns before first send)
- Domain authentication status on every campaign review screen

---

## Open questions

1. **Org-level sender quota.** Postmark's default token is shared across all orgs. Do we want per-org Postmark child accounts (better deliverability isolation) or per-org rate limiting on the shared token? Slice A uses per-org rate limit; Slice D could move to per-org accounts.

2. **Image hosting in campaign bodies.** Reuse R2 (we already have signed PUT for events). Yes for Slice A; revisit if organizers need bulk-paste from Notion/Google Docs.

3. **Recipient view of the campaign archive.** Eventbrite shows attendees their email history per event. Nice-to-have, not in any slice. Logged as a separate item.

4. **Per-org branding in email shell.** The transactional emails already use org name + logo URL. Campaigns reuse the same wrap template, with one tweak: campaigns can opt out of the brand wrap entirely (some organizers prefer a clean inbox look).

---

## Risk register

| Risk | Mitigation |
|---|---|
| Organizer sends spam, harms Postmark reputation | Per-org rate limit (Slice A), abuse review queue (Slice B), per-org Postmark child accounts (Slice D) |
| Recipient clicks unsub but it does not work | One-click endpoint logs every attempt; bug surfaces in audit log + Sentry |
| Webhook missed → status stays "sent" forever | Scheduled reconciliation reads Postmark message stats API for last 24h, backfills |
| GDPR / NDPR | Suppression list is per-org; data-export endpoint covers campaign_sends |

---

## Touch points with existing modules

- `notifications.module` — re-uses Postmark provider, NOT NotificationsService methods (campaigns are bulk, not transactional)
- `auth` — `JwtOrApiKeyGuard` + new scope `campaigns.write`
- `events`, `registrations`, `users` — read-only for audience materialisation
- `audit` — every send + cancel + unsubscribe writes one audit row
- `OUTSTANDING.md` — Slice A flips from "missing" to "shipped"; Slices B/C/D listed as scoped follow-ups
- `SECURITY_AUDIT.md` — new endpoints added to api-authz test config; postmark webhook signing is a SECURITY_REVIEW item
- BullMQ + Upstash Redis — `campaign:send` queue; already in the stack
