# Phase 3.1: Lean registration end-to-end

This slice delivers attendee registration from web and mobile, with capacity-aware
reservation, free ticket issuance, organizer-side registration list, mobile QR
ticket, and confirmation email. Paid tiers reach an "awaiting payment" state and
hand off cleanly to Slice 3.2 (Stripe).

## What you can do now

End users can:

1. Open `/e/[code]/register` on web (or the Tickets tab in the mobile app) and
   fill in attendee details for a free or paid tier.
2. Register multiple attendees in one go up to the tier's `maxPerOrder`.
3. Land on `/t/[code]` (web) or the Ticket screen (mobile) with a real QR code
   bound to the ticket id, valid for scanner verification.
4. Receive a confirmation email containing per-attendee tickets and direct
   "View ticket" links.

Organizers can:

5. Open `/dashboard/events/[id]/registrations` to see who has registered,
   filter by status, and search by name or email.

## Files added or changed

API
- `apps/api/src/modules/registrations/ticket-signer.ts` (HMAC-signed QR payload)
- `apps/api/src/modules/registrations/dto/registration.dto.ts`
- `apps/api/src/modules/registrations/registrations.service.ts` (capacity-aware
  reserve via `select ... for update`, free vs paid branching, user upsert by
  email, email confirmation)
- `apps/api/src/modules/registrations/registrations.controller.ts` (Public,
  Tickets, Me, Organizer controllers)
- `apps/api/src/modules/registrations/registrations.module.ts`
- `apps/api/src/app.module.ts` (registers RegistrationsModule)
- `apps/api/src/modules/notifications/templates.ts` (added
  `ticketConfirmationTemplate`)
- `apps/api/src/modules/notifications/notifications.service.ts`
  (`sendTicketConfirmationEmail`)
- `apps/api/src/config/env.schema.ts` (added `TICKET_SIGNING_SECRET`,
  `ORDER_HOLD_TTL_MIN`)
- `apps/api/.env.example` (new keys)
- `scripts/setup-dev-env.mjs` (auto-injects `TICKET_SIGNING_SECRET`)

Shared
- `packages/contracts/src/index.ts` (added `PaymentMethod`, `AttendeeInput`,
  `RegisterAttendeesInput`, `IssuedTicket`, `OrderSummary`, `RegistrationResult`,
  `PublicTicket`, `RegistrationRow`)
- `packages/sdk/src/index.ts` (added `client.registration.register`,
  `getTicket`, `myTickets`, and `client.org(orgId).registrations.list`)

Web (public)
- `apps/web/lib/registration.ts` (typed registration API + money/date format helpers)
- `apps/web/app/(public)/e/[code]/register/page.tsx` (tier picker, attendee
  list, capacity-aware submit)
- `apps/web/app/t/[code]/page.tsx` (post-registration ticket page with QR mock)
- `apps/web/app/r/[id]/pending/page.tsx` (paid-flow placeholder until 3.2)
- `apps/web/app/(public)/e/[code]/page.tsx` ("Get tickets" button now points
  at `/e/[code]/register`)

Web (organizer)
- `apps/web/app/(organizer)/dashboard/events/[id]/registrations/page.tsx`
  (list, status filter, search)
- `apps/web/app/(organizer)/dashboard/events/[id]/page.tsx` (added a
  "Registrations" link)

Mobile
- `apps/mobile/src/api/client.ts` (registrationApi, ticket / order types)
- `apps/mobile/app/(event)/_layout.tsx` (registers `register` and `ticket`)
- `apps/mobile/app/(event)/register.tsx` (tier picker + attendee form)
- `apps/mobile/app/(event)/ticket.tsx` (real QR via `react-native-qrcode-svg`)
- `apps/mobile/app/(event)/home.tsx` (Tickets tab "Register" button now
  routes to the register screen)
- `apps/mobile/package.json` (added `react-native-qrcode-svg`)

## Endpoints

```
# Public
POST /v1/events/by-code/:code/register
GET  /v1/tickets/by-code/:code

# Authenticated attendee
GET  /v1/me/tickets

# Organizer (RolesGuard, min role: staff)
GET  /v1/organizations/:orgId/events/:eventId/registrations?status=&q=
```

## Validation and safety notes

- Capacity is enforced inside a Postgres transaction. The tier row is locked
  with `select ... for update`, and the in-memory check happens after the lock
  is held. `quantitySold` is only incremented after the check passes. Two
  concurrent registrants for the last seat get serialized; the loser receives
  `409 Conflict`.
- One registration per `(eventId, userId)` is enforced by the schema's unique
  constraint. Re-registering for the same event upserts the existing
  registration and appends new tickets.
- `priceMinor` is `BigInt` end to end. The contract widens to `Number` only at
  the JSON boundary; ticket prices stay below `Number.MAX_SAFE_INTEGER` in
  practice.
- The QR token is `base64url(JSON(payload)).base64url(hmac-sha256)` with the
  payload `{ t: ticketId, e: eventId, iat, exp? }`. The signer is the only
  surface that touches `TICKET_SIGNING_SECRET`. The scanner app in a future
  slice verifies signature and expiry before any DB lookup.
- Public ticket lookup by `code` returns ticket data plus a fresh `qrToken`.
  Sharing the URL is intentional within a small group; the QR is bound to the
  ticket id, so cloning the link does not duplicate seat consumption.
- Public registration is rate-limited (10 per minute per IP via
  `@Throttle`).
- Registration creates the user on the fly (no password, `emailVerified=false`).
  A future slice should add a magic-link path for the attendee to authenticate
  and access `/v1/me/tickets`.
- The confirmation email is best-effort. A failure during send does not roll
  back the registration; the attendee can always retrieve the ticket from the
  URL or the mobile app.

## Paid flow status

For paid tiers the API:

1. Creates the `Registration` in `pending`.
2. Creates an `Order` with `status='pending'`, `provider=<requested>`, and the
   correct subtotal/total in minor units.
3. Increments tier `quantitySold` (the seat is held).
4. Returns `order.checkoutUrl = null`.

The UI surfaces this as "Payment is on the way" today. Slice 3.2 wires Stripe
hosted checkout, replaces the placeholder URL with the live session URL, and
flips registration / ticket status on `checkout.session.completed`.

## What is intentionally not in this slice

- Hosted-checkout URLs for any provider.
- A scheduled job to release stale pending orders. The data is in place
  (`createdAt`, `ORDER_HOLD_TTL_MIN`); the BullMQ worker arrives in 3.2.
- Apple Wallet / Google Wallet pass generation.
- Magic-link sign-in flow tying anonymous registrations to authenticated
  accounts.
- Discount codes, group tickets above a single tier per order, refunds.

## Verification

After installing the new dependency:

```
pnpm install
pnpm --filter @orkora/api typecheck
pnpm --filter @orkora/web typecheck
pnpm --filter @orkora/mobile typecheck
```

Smoke test (with `pnpm dev` running):

1. Open http://localhost:3000/e/DEMO2026/register
2. Pick the Free tier (200 seats), enter `you@example.com`, submit.
3. You land on `/t/<code>` with a QR code rendered.
4. Open http://localhost:3000/dashboard/events/<id>/registrations as the demo
   owner: your registration appears in the table.
5. In the mobile app, type `DEMO2026`, go to the Tickets tab, tap **Register**,
   complete the form, and confirm the QR renders.
