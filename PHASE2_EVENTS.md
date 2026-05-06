# Phase 2: Events

This phase delivers production-shaped event creation, publishing, agenda, speakers, and ticket tiers. It is wired through the API, the organizer web app, and the attendee mobile app, with shared schemas and a typed SDK.

## What you can do now

Organizers can:

1. Create a new event from the web dashboard, save it as a draft, and edit it freely.
2. Publish, unpublish, or archive an event. Published events are visible to the public; archived events are read-only.
3. Manage the agenda: add tracks (with optional color), add sessions to tracks (with start/end, stream URL, capacity, RSVP flag), and remove either.
4. Manage speakers: add a name, title, bio, avatar, and social links.
5. Build ticket tiers: name, description, price (in minor units), currency (NGN, USD, KES, GHS, ZAR, etc.), inventory cap, per-order min/max, sale window, group flag, and ordering.
6. Reorder ticket tiers in bulk via drag-and-drop friendly endpoint.
7. Copy a public share link straight from the event detail page.

End users can:

8. Open `/(public)/e/[code]` on the web to see the marketing landing page (hero banner, agenda grouped by day, speaker grid, ticket tiers).
9. Open the event in the mobile app via code entry; the home screen shows tabs for Agenda / Speakers / Tickets, all populated from the API.

## Files added or changed

API
- `apps/api/src/modules/events/dto/event.dto.ts` (added Create/Update DTOs for events, tracks, sessions, speakers, ticket tiers, and a reorder DTO)
- `apps/api/src/modules/events/events.service.ts` (rewritten: createForOrg, listForOrg, getForOrg, update, publish, unpublish, archive, deleteEvent, plus tracks/sessions/speakers/tiers CRUD, slug + code generators, BigInt-safe serializers, public slug fetch)
- `apps/api/src/modules/events/events.controller.ts` (split into `EventsController` for public reads and `OrganizerEventsController` for `/v1/organizations/:orgId/events/...` with `RolesGuard`)
- `apps/api/src/modules/events/events.module.ts` (registers both controllers)

Shared
- `packages/contracts/src/index.ts` (added PublicEventTier, PublicEventTrack, PublicEventSession, PublicEventSpeaker; expanded PublicEvent; added CreateEventInput, UpdateEventInput, OrganizerEventSummary, CreateTrackInput, CreateSessionInput, UpdateSessionInput, CreateSpeakerInput, CreateTicketTierInput, UpdateTicketTierInput, ReorderTiersInput)
- `packages/sdk/src/index.ts` (added `events.findBySlug` and an organizer sub-client `client.org(orgId)` exposing list/create/get/update/publish/unpublish/archive/remove plus nested tracks/sessions/speakers/tiers helpers; added optional `getActiveOrgId` to set `X-Organization-Id`)

Web (organizer)
- `apps/web/lib/events.ts` (typed `eventsApi(orgId)`, `readActiveOrgId` from JWT memberships, `formatPrice`, `formatEventDateRange`)
- `apps/web/app/(organizer)/dashboard/events/page.tsx` (list with status filters and search)
- `apps/web/app/(organizer)/dashboard/events/new/page.tsx` (create form: title, description, kind, dates, capacity, banner)
- `apps/web/app/(organizer)/dashboard/events/[id]/page.tsx` (detail page with publish toggle, archive, copy share link, ticket tiers section with inline create/delete)

Web (public)
- `apps/web/app/(public)/e/[code]/page.tsx` (rewritten: hero with banner, About, agenda grouped by day with track pills, speaker grid, ticket tier cards with sold-out state)

Mobile
- `apps/mobile/src/api/client.ts` (added PublicTier, PublicTrack, PublicSession, PublicSpeaker types; expanded PublicEvent; added `eventsApi.findBySlug`)
- `apps/mobile/app/(event)/home.tsx` (rewritten: real data via `eventId` or `code` route param, hero, three-tab layout for Agenda/Speakers/Tickets, empty states, BigInt-safe price formatting)

## Endpoints

```
# Public
GET /v1/events/by-code/:code
GET /v1/events/by-slug/:orgSlug/:eventSlug
GET /v1/events/:id                         (auth)

# Organizer (under RolesGuard)
GET    /v1/organizations/:orgId/events
POST   /v1/organizations/:orgId/events
GET    /v1/organizations/:orgId/events/:eventId
PATCH  /v1/organizations/:orgId/events/:eventId
DELETE /v1/organizations/:orgId/events/:eventId
POST   /v1/organizations/:orgId/events/:eventId/publish
POST   /v1/organizations/:orgId/events/:eventId/unpublish
POST   /v1/organizations/:orgId/events/:eventId/archive

# Tracks
POST   /v1/organizations/:orgId/events/:eventId/tracks
GET    /v1/organizations/:orgId/events/:eventId/tracks
DELETE /v1/organizations/:orgId/events/:eventId/tracks/:trackId

# Sessions
POST   /v1/organizations/:orgId/events/:eventId/sessions
PATCH  /v1/organizations/:orgId/events/:eventId/sessions/:sessionId
DELETE /v1/organizations/:orgId/events/:eventId/sessions/:sessionId

# Speakers
POST   /v1/organizations/:orgId/events/:eventId/speakers
GET    /v1/organizations/:orgId/events/:eventId/speakers
DELETE /v1/organizations/:orgId/events/:eventId/speakers/:speakerId

# Ticket tiers
POST   /v1/organizations/:orgId/events/:eventId/tiers
GET    /v1/organizations/:orgId/events/:eventId/tiers
PATCH  /v1/organizations/:orgId/events/:eventId/tiers/:tierId
DELETE /v1/organizations/:orgId/events/:eventId/tiers/:tierId
PUT    /v1/organizations/:orgId/events/:eventId/tiers/reorder
```

Role policy (minimum role required):
- list / get / list-tracks / list-speakers / list-tiers: `staff`
- create / update / publish / unpublish: `organizer`
- archive / delete: `admin`

## Validation and safety notes

- Event codes are 6 characters from a 31-char alphabet that omits visually confusing characters (`I`, `O`, `1`, `0`, `L`). Up to 8 retries on collision.
- Slugs are derived from the title, normalized (NFKD), de-accented, lowercased, and de-duplicated within an organization (`tech-summit`, `tech-summit-2`, ...). Title changes regenerate the slug, excluding the current event so the same title can keep its existing slug.
- `endAt` must be strictly after `startAt`. Same rule for sessions and tier sale windows.
- Publish refuses if the event has already ended.
- Delete is only allowed on drafts with zero registrations; otherwise the user is told to archive.
- Tier prices are stored as `BigInt` in the database and serialized to `number` when the JSON contract is small enough (always for ticket prices in practice).
- Reorder validates that every supplied tier id belongs to the requested event before issuing the position updates inside a transaction.
- Tier delete refuses if any tickets have already been sold (`quantitySold > 0`).
- The `RolesGuard` also resolves the active org id from the route param, attaches `activeOrgId` and `activeRole` to the request user, so downstream interceptors (audit log, tenancy) can use them.

## What is intentionally not in this phase

- Registration and ticket purchase (cart, checkout, Paystack/Flutterwave/Stripe wiring). The tier surface is in place; payment plumbing comes in Phase 3.
- A capacity-aware reservation hold. Today the tier shows `quantitySold`, but no row-locking reservation flow exists yet.
- Image upload for banner and avatars. The current API expects external URLs. A presigned-upload endpoint backed by S3 / Cloudflare R2 is a follow-up.
- Multi-day agenda drag-and-drop reorder on web (the contract supports it, the UI does not).
- Mobile "My Ticket" QR view, since registration is in Phase 3.
- Apple JWK signature verification (deferred from Phase 1, still applies).

## Verification

14 TypeScript and TSX files (3,607 lines) parse cleanly:

```
apps/api/src/modules/events/dto/event.dto.ts
apps/api/src/modules/events/events.service.ts
apps/api/src/modules/events/events.controller.ts
apps/api/src/modules/events/events.module.ts
packages/contracts/src/index.ts
packages/sdk/src/index.ts
apps/web/lib/auth.ts
apps/web/lib/events.ts
apps/web/app/(organizer)/dashboard/events/page.tsx
apps/web/app/(organizer)/dashboard/events/new/page.tsx
apps/web/app/(organizer)/dashboard/events/[id]/page.tsx
apps/web/app/(public)/e/[code]/page.tsx
apps/mobile/app/(event)/home.tsx
apps/mobile/src/api/client.ts
```

The Prisma schema and `schema.sql` did not change in this phase; everything reuses the existing `events`, `tracks`, `sessions`, `speakers`, and `ticket_tiers` tables defined in Phase 0.
