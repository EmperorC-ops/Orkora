# Phase 3.3: Paystack + Flutterwave

This slice plugs the two African-market providers into the registry built in
Slice 3.2. Nothing else in the system needed to change: no new endpoints, no
new state machine, no new UI flows. Adding a third concrete provider proves
the abstraction works.

## What you can do now

End users can:

1. Pick any paid tier on `/e/[code]/register`. The web app asks the API which
   provider to use for the tier's currency and routes accordingly.
2. NGN, GHS, ZAR, KES, XAF, XOF tiers default to Paystack, then Flutterwave,
   then Stripe.
3. USD, EUR, GBP, CAD, AUD tiers default to Stripe, then Flutterwave, then
   Paystack.
4. The recommendation honours which providers are actually configured on the
   server, so a dev setup with only Stripe keys still routes everything to
   Stripe without any code changes.

Operators can:

5. Add `PAYSTACK_SECRET_KEY` to `apps/api/.env` to enable Paystack.
6. Add `FLUTTERWAVE_SECRET_KEY` and `FLUTTERWAVE_WEBHOOK_SECRET` to enable
   Flutterwave.
7. Restart the API. Webhook endpoints are immediately live at
   `/v1/payments/webhook/paystack` and `/v1/payments/webhook/flutterwave`.

## Files added or changed

API
- `apps/api/src/modules/payments/providers/paystack.provider.ts` (new:
  Paystack implementation, HMAC-SHA512 webhook verification)
- `apps/api/src/modules/payments/providers/flutterwave.provider.ts` (new:
  Flutterwave implementation, secret-hash webhook verification)
- `apps/api/src/modules/payments/providers/registry.ts` (registers the two
  new providers, adds `pickForCurrency()` for currency-aware default
  selection)
- `apps/api/src/modules/payments/payments.module.ts` (provides the new
  classes)
- `apps/api/src/modules/payments/payments.service.ts` (exposes
  `pickProviderForCurrency()`)
- `apps/api/src/modules/payments/payments.controller.ts`
  (`GET /v1/payments/methods?currency=XYZ` now returns
  `{ methods, recommended }`)

Shared
- `packages/contracts/src/index.ts` (`PaymentMethodsResponse` gained
  `recommended`)
- `packages/sdk/src/index.ts` (`client.payments.methods(currency?)` accepts
  the new query param)

Web
- `apps/web/lib/registration.ts` (`paymentsApi.methods(currency?)` updated)
- `apps/web/app/(public)/e/[code]/register/page.tsx` (paid flow now asks
  the API for the recommended provider before calling `register`; clean
  "not configured" message when no provider matches)

Env
- `apps/api/.env.example` already had the keys from Slice 3.2.

## Provider parity

| Capability                          | Stripe | Paystack | Flutterwave |
|-------------------------------------|:------:|:--------:|:-----------:|
| Hosted-checkout URL                 |   x    |    x     |      x      |
| Webhook signature verification      |   x    |    x     |      x      |
| `paid` outcome                      |   x    |    x     |      x      |
| `failed` outcome (release seats)    |   x    |    x     |      x      |
| `refunded` outcome                  |   x    |    x     |      x      |
| Idempotent state transitions        |   x    |    x     |      x      |

All three implement the same `PaymentProvider` interface from `providers/types.ts`.
The `PaymentsService` does not import any provider directly: it goes through
`PaymentsRegistry.resolve(name)`. Adding a fourth provider is exactly the
same pattern: write the file, register it in `payments.module.ts`, list it in
`registry.ts` constructor.

## Provider selection rules

Implemented in `PaymentsRegistry.pickForCurrency`:

- **NGN, GHS, ZAR, KES, XAF, XOF**: Paystack -> Flutterwave -> Stripe
- **everything else**: Stripe -> Flutterwave -> Paystack
- A provider is only considered if its env keys are present AND its
  `supportedCurrencies` list contains the requested currency.
- Final fallback: any enabled provider, regardless of currency match. This
  prevents a misconfigured tier from killing checkout outright.

The web register page reads the recommendation via
`GET /v1/payments/methods?currency=NGN` and passes the resulting name as
`paymentMethod` on the registration call. The recommendation is server-side
only, so adding or removing providers does not require a front-end deploy.

## Webhook signature schemes

The three providers each verify webhooks differently. Centralising this in
the providers (not the controller) keeps the controller simple and makes it
easy to add a fourth provider later.

- **Stripe**: HMAC of raw body using the webhook secret. Library:
  `stripe.webhooks.constructEvent`.
- **Paystack**: HMAC-SHA512 of raw body using the API secret key (yes, the
  same key, by design). Header: `x-paystack-signature`.
  https://paystack.com/docs/payments/webhooks
- **Flutterwave**: Static secret hash echoed back in the `verif-hash`
  header. Set in the Flutterwave dashboard under Webhooks. Compared in
  constant time. https://developer.flutterwave.com/docs/integration-guides/webhooks

In all three cases the controller pulls `req.rawBody` (enabled at the Nest
factory level in `main.ts`) and forwards it to the provider's
`parseAndVerifyWebhook(rawBody, signatureHeader)`.

## Local dev: enabling Paystack

1. Sign up at https://dashboard.paystack.com (free, no business verification
   needed for test mode).
2. Toggle to **Test mode** and grab your **Test Secret Key** from the API
   Keys section. It looks like `sk_test_xxx`.
3. Add to `apps/api/.env`:

   ```
   PAYSTACK_SECRET_KEY=sk_test_xxx
   ```

4. Restart `pnpm dev`. Paystack is now eligible.
5. To receive webhooks during local development, expose `localhost:4000` to
   the internet using a tunnelling tool (ngrok, cloudflared, tailscale
   funnel). For example:

   ```
   ngrok http 4000
   ```

   Take the public URL (e.g. `https://abc123.ngrok-free.app`) and set the
   webhook in Paystack dashboard to:

   ```
   https://abc123.ngrok-free.app/v1/payments/webhook/paystack
   ```

6. Trigger a test transaction from the register page. Paystack will redirect
   you to its hosted checkout, you complete with their test card
   (`4084 0840 8408 4081`, `408`, `01/30`), Paystack POSTs `charge.success`
   to your tunnel, and the order flips to `paid`.

## Local dev: enabling Flutterwave

1. Sign up at https://dashboard.flutterwave.com.
2. Switch to **Test mode**, copy your **Secret Key** (`FLWSECK_TEST-...`)
   and pick or generate a **secret hash** under Settings -> Webhooks.
3. Add to `apps/api/.env`:

   ```
   FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-xxx
   FLUTTERWAVE_WEBHOOK_SECRET=your-secret-hash-string
   ```

4. Set the webhook URL in the Flutterwave dashboard to
   `https://<your-tunnel>.ngrok-free.app/v1/payments/webhook/flutterwave`
   and paste the same secret hash there.
5. Restart `pnpm dev`.
6. Trigger a test transaction. Flutterwave's test cards live at
   https://developer.flutterwave.com/docs/test-cards.

## What is intentionally not in this slice

- A `webhook_events` ledger table (still relying on order state for
  idempotency, same as 3.2).
- An organizer setting to override the default provider per organization or
  per event. The registry exposes the hook (`pickForCurrency`); plumbing it
  through to the events table is a future add.
- A retry / reconciliation job that polls provider APIs when a webhook is
  missed. The stale-hold cron still releases the seat after
  `ORDER_HOLD_TTL_MIN`, so there is no inventory leak.
- Refund initiation UI for organizers.
- Multi-currency reporting roll-up in analytics.

## Verification

```
pnpm install
pnpm --filter @orkora/api typecheck
pnpm --filter @orkora/web typecheck
```

Smoke test (with `pnpm dev` and an appropriate webhook tunnel):

1. Add Paystack and / or Flutterwave keys to `apps/api/.env`. Restart.
2. Open `/e/DEMO2026/register`. The Standard tier is in NGN, so the page
   will ask the API for the recommended provider, get `paystack`, and
   redirect to the Paystack hosted checkout page.
3. Complete the payment with a test card. Within 2 to 5 seconds the
   confirmation page flips to "You are registered." and shows the ticket.
4. Same flow with `FLUTTERWAVE_SECRET_KEY` set and `PAYSTACK_SECRET_KEY`
   removed will route to Flutterwave instead, with no code changes.
