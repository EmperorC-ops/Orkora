# Phase 3.2: Stripe checkout

This slice adds real payments to the lean registration flow. It introduces a
provider-registry pattern so adding Paystack and Flutterwave (Slice 3.3) is a
one-file change. Stripe is the first concrete implementation, but the
abstractions are the durable piece.

## What you can do now

End users can:

1. Pick a paid tier on `/e/[code]/register`, fill in attendee details, and be
   redirected to Stripe Checkout.
2. Complete the payment with a real card (or `4242 4242 4242 4242` in test
   mode) and land on `/r/[orderId]/confirm`.
3. Watch the confirmation page poll while Stripe sends us the
   `checkout.session.completed` webhook, then see issued tickets with direct
   links to the QR.
4. Cancel mid-checkout and land on `/r/[orderId]/cancelled`. Their seats are
   released as soon as the webhook reports the cancel, and the cron job will
   release stale holds that never produced a webhook.

## Files added or changed

API
- `apps/api/src/modules/payments/providers/types.ts` (PaymentProvider
  interface, CreateCheckoutInput, WebhookOutcome)
- `apps/api/src/modules/payments/providers/stripe.provider.ts` (creates
  Checkout Sessions, verifies webhooks, parses
  `checkout.session.completed` /
  `async_payment_succeeded` /
  `async_payment_failed` /
  `expired` /
  `charge.refunded`)
- `apps/api/src/modules/payments/providers/registry.ts` (resolves a provider
  by name, only returns enabled ones, throws a clear error otherwise)
- `apps/api/src/modules/payments/payments.service.ts` (createCheckoutForOrder,
  handleWebhook, getOrderStatus, releaseStaleHolds, idempotent state
  transitions, paid-flow confirmation email)
- `apps/api/src/modules/payments/payments.controller.ts`
  (`GET /v1/payments/methods`,
  `POST /v1/payments/orders/:orderId/checkout`,
  `GET /v1/payments/orders/:orderId`,
  `POST /v1/payments/webhook/:provider`)
- `apps/api/src/modules/payments/stale-hold.cron.ts` (releases pending orders
  older than `ORDER_HOLD_TTL_MIN`, runs every minute via @nestjs/schedule)
- `apps/api/src/modules/payments/payments.module.ts`
- `apps/api/src/app.module.ts` (registers PaymentsModule)
- `apps/api/src/main.ts` (`rawBody: true` so the webhook controller can read
  the unparsed payload for HMAC verification)
- `apps/api/package.json` (added `stripe`, `@nestjs/schedule`)

Shared
- `packages/contracts/src/index.ts` (CheckoutSessionResponse, OrderStatusView,
  PaymentMethodsResponse)
- `packages/sdk/src/index.ts` (`client.payments.methods`, `startCheckout`,
  `getOrder`)

Web
- `apps/web/lib/registration.ts` (added `paymentsApi` + `OrderStatusView` type)
- `apps/web/app/(public)/e/[code]/register/page.tsx` (paid flow now calls
  `/v1/payments/orders/:orderId/checkout` and redirects to the returned URL;
  surfaces a clear "not configured" message when keys are missing in dev)
- `apps/web/app/r/[id]/confirm/page.tsx` (new: polls order until paid /
  failed / refunded, then renders the issued tickets with links to `/t/[code]`)
- `apps/web/app/r/[id]/cancelled/page.tsx` (new: clean cancel landing)

## Endpoints

```
GET  /v1/payments/methods                     # which providers are enabled
POST /v1/payments/orders/:orderId/checkout    # mint a checkout URL
GET  /v1/payments/orders/:orderId             # status + tickets (poll)
POST /v1/payments/webhook/stripe              # raw-body, signature-verified
```

## Order state machine

```
pending  ── webhook 'paid' ──────► paid
pending  ── webhook 'failed' ────► failed   (seats released)
pending  ── webhook 'expired' ───► failed   (seats released)
pending  ── cron stale-hold ─────► failed   (seats released)
paid     ── webhook 'refunded' ─► refunded
```

Re-entry is idempotent: a `paid` order ignores subsequent `paid` events, and a
`failed` order ignores subsequent `paid` events with a warning log so
operations can spot misconfigured retries.

## Validation and safety notes

- The Stripe provider is only registered when `STRIPE_SECRET_KEY` is set.
  Without it, `GET /v1/payments/methods` returns an empty list, and the
  register page surfaces a friendly "not configured on this server" message
  instead of a generic 500.
- `STRIPE_WEBHOOK_SECRET` is required to verify webhook signatures. We use
  `stripe.webhooks.constructEvent` which performs constant-time HMAC
  comparison and throws on mismatch.
- The checkout session metadata carries the canonical Orkora `orderId` on
  both the session and the underlying payment intent, so refund webhooks
  resolve to the same order.
- Raw body capture is enabled at the Nest factory level (`rawBody: true`).
  The webhook controller pulls `req.rawBody` and passes it straight to the
  signature verifier; the JSON-parsed body is ignored.
- Refunds, expirations, and explicit failures all release seats by
  decrementing `tier.quantitySold`, marking pending tickets as `cancelled`,
  and flipping the registration to `cancelled`. All inside one transaction.
- The stale-hold cron runs every minute. With `ORDER_HOLD_TTL_MIN=20` (default),
  a user who walks away during checkout will see their seats freed within ~21
  minutes. Tune the env var down for high-pressure events.
- Email confirmation for paid orders is sent only after the state flip from
  pending to paid succeeds, never on the optimistic registration path.

## Local dev: how to actually receive a Stripe webhook

In production the webhook URL is `https://your.api/v1/payments/webhook/stripe`.
For local dev, the easiest path is the Stripe CLI:

```
stripe login
stripe listen --forward-to localhost:4000/v1/payments/webhook/stripe
```

`stripe listen` prints a `whsec_...` value the first time you run it. Put
that into `apps/api/.env` as:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Restart `pnpm dev`. Trigger a test event with:

```
stripe trigger checkout.session.completed
```

You should see the API log `Webhook ignored - No orderId in metadata`, which
is correct: a synthetic Stripe event has no Orkora order behind it. The real
flow happens when you click through the register page yourself.

## What is intentionally not in this slice

- A `webhook_events` table for processed-event-id de-duplication. The state
  machine is already idempotent on the order, but a per-event ledger would
  catch out-of-order or duplicated webhook deliveries even when the order
  state moves on. Will add when we touch payments again.
- Refund initiation from the organizer dashboard. The API handles the
  refund webhook, but there is no UI yet.
- 3DS / SCA error UX beyond what Stripe's hosted page provides.
- Apple Pay / Google Pay buttons. Stripe Checkout already supports them on
  capable devices; no Orkora-side work needed.

## Verification

After installing the new dependencies:

```
pnpm install
pnpm --filter @orkora/api typecheck
pnpm --filter @orkora/web typecheck
```

Smoke test (with `pnpm dev` running and Stripe CLI forwarding):

1. Open http://localhost:3000/e/DEMO2026/register
2. Pick the **Standard** tier (NGN 5,000), fill in name and email, submit.
3. You land on Stripe Checkout. Use card `4242 4242 4242 4242`, any future
   expiry, any CVC.
4. Stripe redirects to `/r/<orderId>/confirm`. Within a few seconds the page
   flips to "You are registered." with ticket cards.
5. Click a ticket. You land on `/t/<code>` with the QR.
6. In the organizer dashboard, open the demo event's Registrations page. The
   row shows status `confirmed`.
