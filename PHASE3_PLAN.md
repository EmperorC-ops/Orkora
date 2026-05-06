# Phase 3 Plan: Registration, Checkout, and Brand Voice

This phase delivers attendee registration, paid checkout via three providers,
the mobile ticket / QR experience, and a marketing homepage that matches the
Orkora brand voice. It builds on top of Phase 1 (Identity) and Phase 2 (Events).

## Slices

The work is organized into four slices, each independently shippable. We will
land them in this order so you have something usable at each step.

### Slice 3.0 - Homepage rewrite (visual, low risk)

Goal: replace the generic landing page with the Orkora brand voice copy and
structure. No backend changes.

Files:
- `apps/web/app/page.tsx` (rewrite)
- `apps/web/app/(public)/layout.tsx` (light tweaks if needed)

Sections, per the brand brief:
1. Hero - "Orchestrate every moment", subtext, primary + secondary CTA, trust strip
2. The Problem (tension)
3. The Shift (reframe)
4. Core Capabilities (4 cards: Plan / Operate / Engage / Measure)
5. How It Works (3 steps)
6. Experience Layer
7. Social Proof framing (built for teams that run events where execution matters)
8. Final CTA - "Start with Orkora"

Voice rules enforced in copy: precise, controlled, assured. No buzzwords.

### Slice 3.1 - Lean (free) registration end-to-end

Goal: any attendee can register for an event from web or mobile. Free tiers
issue a ticket immediately. Paid tiers reserve seats and route to the (still
empty) checkout in 3.2.

API:
- New module `apps/api/src/modules/registrations/`
  - `registrations.service.ts` - reserveSeats, confirmFreeRegistration, listForEvent, getMyTickets
  - `registrations.controller.ts` - public POST register, organizer-side list, attendee-side my-tickets
  - `dto/registration.dto.ts` - RegisterAttendeeDto, RegistrationFormFieldDto
- Capacity-aware reservation: short transaction, `tier.quantitySold` increment with
  conditional check, falls back to 409 on race.
- Free flow: instant `ticket` row issued with QR-payload column.
- Paid flow: creates `order` with `pending` status, returns checkout URL placeholder
  until 3.2 ships.
- Confirmation email via existing `NotificationsModule` (Postmark + console fallback).
- New ticket QR payload: HMAC-signed `{ ticketId, eventId, attendeeId, exp }`.

Shared:
- `packages/contracts/src/index.ts` - RegisterAttendeeInput, PublicTicket, OrderSummary
- `packages/sdk/src/index.ts` - `client.registration.register()`, `client.registration.myTickets()`

Web (public):
- `apps/web/app/(public)/e/[code]/register/page.tsx` - tier-aware registration form
- `apps/web/app/(public)/r/[id]/page.tsx` - post-registration confirmation page

Web (organizer):
- `apps/web/app/(organizer)/dashboard/events/[id]/registrations/page.tsx` - list,
  search, status filter

Mobile:
- `apps/mobile/app/(event)/register.tsx` - mirrors the web form
- `apps/mobile/app/(event)/ticket.tsx` - "My Ticket" screen with QR (using
  `react-native-qrcode-svg`)
- `apps/mobile/src/api/client.ts` - registration + my-tickets helpers

### Slice 3.2 - Stripe checkout

Goal: paid registration completes with a real card payment.

API:
- New module `apps/api/src/modules/payments/`
  - `providers/types.ts` - `PaymentProvider` interface (createCheckoutSession,
    verifyWebhook, parseEvent, refund)
  - `providers/registry.ts` - resolves provider by tier currency + organization preference
  - `providers/stripe.ts` - first concrete implementation
  - `payments.service.ts` - createCheckoutForOrder, handleWebhook (idempotent)
  - `payments.controller.ts` - POST /v1/payments/webhook/stripe with raw-body capture
  - `dto/payment.dto.ts`
- Order state machine: pending -> paid (-> refunded) | expired | failed
- On `checkout.session.completed`: mark order paid, issue ticket(s), send confirmation
- Reservation hold timeout: a small BullMQ job releases stale pending orders after 20 min
- Idempotency: webhook events de-duped by `provider_event_id`

Shared:
- contracts/sdk: `CheckoutSessionResponse`, `OrderStatus`

Web (public):
- Update `register/page.tsx` to redirect to Stripe Checkout for paid tiers,
  return URL hits `/r/[id]/confirm`
- `apps/web/app/(public)/r/[id]/confirm/page.tsx` - polls order status

### Slice 3.3 - Paystack + Flutterwave

Goal: African-market payments via Paystack and Flutterwave, sharing the
provider-registry abstraction from 3.2.

API:
- `providers/paystack.ts`
- `providers/flutterwave.ts`
- Webhook endpoints: `POST /v1/payments/webhook/paystack`, `.../flutterwave`
- Provider selection rule: tier currency NGN/GHS/ZAR/KES -> Paystack first,
  Flutterwave fallback. Other currencies -> Stripe. Organizers can override per
  organization in a future settings UI.

## Validation and safety

- Registration is rate-limited per IP and per email.
- Reservation hold uses `SELECT ... FOR UPDATE` on the tier row to avoid
  oversell.
- Webhook handlers always verify signatures and return 200 even when ignoring
  duplicates, to satisfy provider retry behaviour.
- All money fields stay BigInt in the DB; we only widen to Number at the
  serialization edge for amounts within Number.MAX_SAFE_INTEGER.
- QR ticket payloads are HMAC-signed with `TICKET_SIGNING_SECRET`. Scanner
  rejects expired or unsigned codes.
- The `ProvidersModule` registers providers conditionally: a provider is only
  active if its env keys are present, so dev environments can run with no keys
  set and only the free flow available.

## What is intentionally not in this phase

- Discount codes, group tickets above a single order, pay-later, invoicing.
- Refund UI for organizers (the API supports it, the dashboard does not).
- Apple Wallet / Google Wallet pass generation.
- WebSocket live ticket-sold counters on the public page.
- Post-event survey emails.

## Verification

Each slice ends with:
- `pnpm --filter @orkora/api typecheck`
- `pnpm --filter @orkora/web typecheck`
- `pnpm --filter @orkora/mobile typecheck`
- A manual smoke test of the user-facing flow.
