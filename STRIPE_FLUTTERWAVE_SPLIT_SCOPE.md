# Stripe (Connect) and Flutterwave Platform-Fee Split: Engineering Scope

Status: scoping only. No source code is changed by this document.

Decision (2026-10-07): the Stripe Connect build (Provider A) is NOT being
pursued. Orkora is replacing Stripe with a local provider rather than extending
it. Only the shared guard change and the Flutterwave build (Provider B) proceed.
Provider A is retained below as a record of the analysis, not as a plan. Stripe
stays disabled by leaving STRIPE_SECRET_KEY unset; with the connected-accounts
gate on, a Stripe org has no onboarding path and is blocked at checkout anyway.
The currencies Stripe alone covered in code (EUR, GBP, CAD, AUD) are the gap the
replacement must fill; Flutterwave is the leading candidate pending confirmation
of the currencies enabled on the account.

## Summary

Orkora already takes a platform fee as a settlement split on Paystack. When the
connected-accounts gate is on and an organization has a ready Paystack
subaccount, `createCheckoutForOrder` passes `subaccountCode` and
`platformFeeMinor` into the provider, and `PaystackProvider.createCheckoutSession`
turns those into a Paystack `subaccount` + `transaction_charge` split
(`apps/api/src/modules/payments/providers/paystack.provider.ts:47-100`). Every
other piece of the money path (fee computation, the pass-on/absorb choice, the
refund fee reversal, reconciliation, the settlement amount gate) is already
provider-agnostic and already runs for all providers. The split itself is the
only Paystack-specific branch (`apps/api/src/modules/payments/payments.service.ts:317`).

This scope adds the same split capability to Stripe (via Stripe Connect
destination charges) and to Flutterwave (via its subaccounts split array), each
behind the existing gate, each independently shippable. The two providers share
nothing except the interface in `apps/api/src/modules/payments/providers/types.ts`
and the `payment_connected_accounts` table, so they are written up as two
separate builds below.

### What already exists and is reused unchanged

- The `CreateCheckoutInput` split fields `subaccountCode?: string` and
  `platformFeeMinor?: bigint` (`apps/api/src/modules/payments/providers/types.ts:28-29`).
  These names are Paystack-flavored but are generic carriers: `subaccountCode`
  is documented as "the organizer's connected account" and `platformFeeMinor`
  as "keeps `platformFeeMinor` for the platform" (`types.ts:21-30`).
- Fee computation and storage at order creation:
  `computePlatformFeeMinor` writes `order.feesMinor`
  (`apps/api/src/modules/registrations/registrations.service.ts:388-412`),
  and the schedule lives in `apps/api/src/common/platform-fee.ts`.
- The gate: `connectedAccountsEnabled()` re-exported from
  `apps/api/src/modules/payments/connected-accounts.config.ts:10`, plus
  `accountIsReady(row)` (active + chargesEnabled) at `connected-accounts.config.ts:16-21`.
- `ConnectedAccountsService.getReadyAccountRef` / `isReadyFor` /
  `assertReadyForProvider` / `record`
  (`apps/api/src/modules/payments/connected-accounts.service.ts:141-172, 64-118`).
- The `payment_connected_accounts` table (migration
  `apps/api/migrations/0022_payment_connected_accounts.sql`, Prisma model
  `apps/api/prisma/schema.prisma:732-749`), already documented to hold a
  "Stripe connected account id acct_..., Paystack subaccount code, or
  Flutterwave subaccount id" (`0022_payment_connected_accounts.sql:8-9`).
- The refund fee reversal: `refundBreakdownMinor`
  (`apps/api/src/common/platform-fee.ts:161-169`) feeds
  `PaymentsService.refundOrder` (`payments.service.ts:103-114`), which refunds
  the full buyer total regardless of provider.
- The settlement amount gate `verifySettlementAmount`
  (`payments.service.ts:574-660`), which is unaffected by splits because a
  destination/split charge still reports the full captured amount and currency.

### The one place that gates the split today

`payments.service.ts:315-329` currently reads:

```
let splitAccountRef: string | undefined;
let platformFeeMinor: bigint | undefined;
if (connectedAccountsEnabled() && providerName === 'paystack') {
  const accountRef = await this.connectedAccounts.getReadyAccountRef(...);
  if (accountRef) {
    splitAccountRef = accountRef;
    const capped = order.feesMinor > order.totalMinor ? order.totalMinor : order.feesMinor;
    platformFeeMinor = capped > 0n ? capped : 0n;
  }
}
```

The `providerName === 'paystack'` condition is the single guard to relax. Once
Stripe and Flutterwave can consume the split, this becomes a set membership
check (for example `SPLIT_CAPABLE.has(providerName)`) or is dropped entirely so
every provider that has a ready account gets the split, with providers that do
not support it ignoring the fields (the interface already promises this at
`types.ts:22-27`). Because `platformFeeMinor` is already capped to the order
total here, both new providers inherit that safety for free.

---

## Provider A: Stripe (Stripe Connect)

Current Stripe checkout uses `checkout.sessions.create` with `mode: 'payment'`
and no `application_fee_amount` or `transfer_data`
(`apps/api/src/modules/payments/providers/stripe.provider.ts:44-73`). Refunds go
through `refunds.create` on the session's PaymentIntent
(`stripe.provider.ts:215-238`). There is no Connect onboarding anywhere in the
repo today; `ConnectedAccountsService.record` is the only way a Stripe
`accountRef` can currently land in the table, and it is a manual admin path
(`connected-accounts.service.ts:64-118`).

### A(a) Onboarding

Goal: let an organizer connect a Stripe account and store its `acct_...` id plus
readiness in `payment_connected_accounts`, mirroring how
`PaystackOnboardingService` creates and records a Paystack subaccount
(`apps/api/src/modules/payments/paystack-onboarding.service.ts:41-77`).

Recommended mechanism (confirm against current Stripe Connect docs before
building): Stripe Connect Express accounts with hosted onboarding via Account
Links.

1. Create a connected account: `stripe.accounts.create({ type: 'express', ... })`,
   which returns an `acct_...` id.
2. Create an Account Link: `stripe.accountLinks.create({ account, refresh_url,
   return_url, type: 'account_onboarding' })` and redirect the organizer to
   `accountLink.url` (this is a redirect flow, unlike Paystack's direct create).
3. On return, and via the `account.updated` webhook, read the account's
   `charges_enabled` and `payouts_enabled` flags and store them.

What gets stored (reusing `ConnectedAccountsService.record`,
`connected-accounts.service.ts:64-118`):

- `provider: 'stripe'`
- `accountRef`: the `acct_...` id
- `status`: `'active'` only once Stripe reports `charges_enabled === true`,
  otherwise `'pending'`. Note `record()` today ties both `chargesEnabled` and
  `payoutsEnabled` to the single `active` flag
  (`connected-accounts.service.ts:88-103`); Stripe reports these two flags
  independently, so onboarding will need to set them from the real Stripe values
  rather than from one boolean (see A(e)).
- `metadata`: display-only (business name, country, the two enabled flags for the
  UI). Never store secrets.

Readiness stays defined by `accountIsReady` (active + chargesEnabled,
`connected-accounts.config.ts:16-21`), which already matches Stripe semantics:
an Express account can take a destination charge once `charges_enabled` is true,
even before payouts are fully enabled.

### A(b) Checkout split

Mechanism (confirm against current Stripe docs): a destination charge with an
application fee. For a Checkout Session in `mode: 'payment'`, the PaymentIntent
options are set through `payment_intent_data`
(`stripe.provider.ts:66-68` already uses `payment_intent_data` for metadata, so
the shape is known):

```
payment_intent_data: {
  metadata: { orderId: input.orderId },
  application_fee_amount: toSmallestUnit(input.platformFeeMinor, input.currency),
  transfer_data: { destination: input.subaccountCode },
}
```

Field mapping to the existing interface (no interface change required for the
happy path):

- `input.subaccountCode` (the `acct_...` id) -> `transfer_data.destination`.
- `input.platformFeeMinor` -> `application_fee_amount`, converted with the
  existing `toSmallestUnit(amountMinor, currency)`
  (`apps/api/src/modules/payments/money.ts:56-59`), exactly as Paystack converts
  its `transaction_charge` (`paystack.provider.ts:63`).
- Only attach these when `input.subaccountCode` is present, matching the Paystack
  guard at `paystack.provider.ts:59`.

Semantics to confirm in test mode: with a destination charge, Stripe moves the
full amount to the platform, keeps `application_fee_amount`, and transfers the
remainder to the connected account. The customer is charged
`input.amountMinor` (unchanged), so the settlement amount gate
(`verifySettlementAmount`, `payments.service.ts:574-660`) still sees the full
captured total and continues to pass. This must be verified rather than assumed.

Interface impact: none strictly required, because `subaccountCode` already
carries the `acct_...` id. Optional cleanliness improvement (not required to
ship): rename or alias the field to a provider-neutral name such as
`connectedAccountRef` in `types.ts:28`. That is a cross-provider refactor and
should be treated as a separate, optional change so the two providers stay
independent.

### A(c) Webhooks

Current Stripe webhook handling covers `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, the failed/expired pair, and
`charge.refunded` / `charge.refund.updated`
(`stripe.provider.ts:92-174`). New events for the split:

- `account.updated` (Connect): update the stored `chargesEnabled` /
  `payoutsEnabled` / `status` for the matching `acct_...`. This is the event that
  flips a `pending` connected account to `active`. It arrives on the Connect
  webhook and carries the account id in `event.account`; confirm current payload
  shape and whether a separate Connect webhook endpoint/secret is needed (see
  A(e) and risks).
- `charge.refunded` already resolves `orderId` off the PaymentIntent
  (`stripe.provider.ts:147-171`) and keeps working for split charges. Confirm the
  event still fires for a destination charge and that no extra handling is needed
  for the application-fee side.
- Optional: `application_fee.refunded` if we want to observe the fee reversal
  independently. Not required for correctness because the refund path reverses
  the fee at request time (see A(d)).

New webhook events must be added to the `switch` at `stripe.provider.ts:92`, all
returning a canonical `WebhookOutcome` (`types.ts:58-62`) or an account-update
side effect. Account-update events do not map to an order outcome, so they need a
path that is not the order `WebhookOutcome` (for example a dedicated method on
the provider plus a handler on `ConnectedAccountsService`), because
`handleWebhook` (`payments.service.ts:412-466`) is order-centric and keys the
idempotency ledger on order outcomes.

### A(d) Refunds and fee reversal

Current refund: `refunds.create({ payment_intent, amount })`
(`stripe.provider.ts:231-236`). For a destination charge, refunding the buyer
does not by itself return the application fee or reverse the transfer. To keep
`refundBreakdownMinor` correct (the platform returns its whole fee under
`PLATFORM_FEE_REFUNDABLE = true`, `platform-fee.ts:152, 161-169`), the refund
call must also reverse the fee and the transfer. Confirm current Stripe
semantics, but the expected shape is:

```
refunds.create({
  payment_intent,
  amount,
  refund_application_fee: true,
  reverse_transfer: true,
})
```

`refund_application_fee: true` returns the platform fee, and
`reverse_transfer: true` claws the transferred remainder back from the connected
account so the money nets to zero on a full refund, which is exactly what
`refundBreakdownMinor` assumes today (buyer gets the full total, platform returns
the full fee). Note the existing comment at `payments.service.ts:96-102` already
frames the fee-aware refund as provider-behavior that "must be confirmed in test
mode"; the same applies here. `verifyRefund` (`stripe.provider.ts:247-266`) reads
`charge.refunded` / `amount_refunded` and needs no change, since a full refund of
a destination charge still marks the charge refunded.

### A(e) Data model, config, env impact

- Table: reuse `payment_connected_accounts` unchanged. `accountRef` already holds
  `acct_...` (migration comment at `0022_payment_connected_accounts.sql:8-9`).
- One behavioral change to `ConnectedAccountsService.record` (or a new dedicated
  update method): today it sets `chargesEnabled` and `payoutsEnabled` from a
  single `active` boolean (`connected-accounts.service.ts:88-103`). Stripe
  reports the two flags separately, so the onboarding/`account.updated` path
  needs to write the real per-flag values. This can be a new method
  (`recordProviderReadiness` or similar) so the existing manual `record` path is
  untouched.
- New env keys:
  - `STRIPE_CONNECT_WEBHOOK_SECRET` if Connect events use a separate endpoint
    (confirm whether Connect and account webhooks can share the existing
    `STRIPE_WEBHOOK_SECRET`, `stripe.provider.ts:25`).
  - `STRIPE_CONNECT_REFRESH_URL` / `STRIPE_CONNECT_RETURN_URL` (or derive from
    the existing `APP_URL`, `payments.service.ts:331`).
  - Possibly a Connect client id if using OAuth Standard accounts instead of
    Express (Express with Account Links does not need one).
- No new columns are required.

### A(f) Files and functions to add or change (Stripe)

- `apps/api/src/modules/payments/providers/stripe.provider.ts`
  - `createCheckoutSession`: add `application_fee_amount` + `transfer_data`
    under `payment_intent_data` when `subaccountCode` is set (around
    `stripe.provider.ts:47-69`).
  - `refund`: add `refund_application_fee` + `reverse_transfer`
    (`stripe.provider.ts:231-236`).
  - `parseAndVerifyWebhook`: handle `account.updated`
    (`stripe.provider.ts:92`).
  - New methods for Connect onboarding: `createConnectedAccount`,
    `createAccountLink`, `retrieveAccount` (mirrors how Paystack put its
    onboarding helpers on the provider, `paystack.provider.ts:305-394`).
- New `apps/api/src/modules/payments/stripe-onboarding.service.ts` mirroring
  `paystack-onboarding.service.ts`, plus a `stripe-onboarding.controller.ts`
  mirroring `paystack-onboarding.controller.ts` (routes under
  `organizations/:orgId/payments/accounts/stripe`).
- `apps/api/src/modules/payments/connected-accounts.service.ts`: add a
  readiness-update method that sets `chargesEnabled` / `payoutsEnabled`
  independently (new method, do not change `record`'s current contract).
- `apps/api/src/modules/payments/payments.service.ts:315-329`: widen the
  split guard beyond `'paystack'`.
- `apps/api/src/modules/payments/payments.module.ts`: register the new service
  and controller (`payments.module.ts:22-39`).
- Webhook routing for Connect events: extend
  `apps/api/src/modules/payments/payments.controller.ts:85-108` or add a
  dedicated Connect webhook route (decide during A(c)).

### A(g) Testing plan (Stripe)

- Unit specs mirroring `stripe.provider.spec.ts` (`apps/api/src/modules/payments/providers/stripe.provider.spec.ts`),
  which already mocks the Stripe client:
  - checkout adds `application_fee_amount` + `transfer_data.destination` only
    when `subaccountCode` is present, and omits them otherwise.
  - `application_fee_amount` equals `toSmallestUnit(platformFeeMinor, currency)`.
  - refund passes `refund_application_fee: true` and `reverse_transfer: true`.
  - `account.updated` maps to the right readiness update.
- Settlement gate: extend `settlement-amount.spec.ts`
  (`apps/api/src/modules/payments/settlement-amount.spec.ts`) to prove a
  destination-charge session still settles at the full captured amount (the gate
  is provider-agnostic, so this is a regression guard).
- Fee/refund math: `platform-fee` and `refundBreakdownMinor` already have the
  reversal contract; add a case asserting the Stripe refund args match the
  full-fee-return policy.
- Test-mode manual checklist:
  1. Create an Express connected account in Stripe test mode, complete hosted
     onboarding, confirm `account.updated` flips the row to `active`.
  2. Run a paid checkout with the gate on; confirm the connected account
     receives the amount minus fee and the platform keeps the application fee.
  3. Confirm the customer was charged the full order total (gate passes).
  4. Full refund; confirm buyer refunded in full, application fee returned, and
     the transfer reversed so the connected account nets zero.
  5. Confirm `charge.refunded` still settles the order locally.

### A(h) Risks and unknowns to confirm against current Stripe docs

- Destination charge vs separate charges-and-transfers: confirm destination
  charge with `application_fee_amount` is still the recommended model for
  Checkout Sessions, and that it is set via `payment_intent_data`.
- Whether Connect `account.updated` events require a separate webhook endpoint
  and secret, or can arrive on the existing endpoint.
- Cross-border and currency constraints: the connected account's country vs the
  charge currency may restrict destination charges. Orkora currently lets Stripe
  handle USD, EUR, GBP, CAD, AUD, NGN, ZAR (`stripe.provider.ts:17`); confirm
  which of these are valid Connect destination currencies.
- Fee currency: `application_fee_amount` is in the charge currency; confirm this
  matches how `platformFeeMinor` is denominated (it is in the order currency,
  `registrations.service.ts:393-401`).
- API version pin (`stripe.provider.ts:32-33`): confirm the pinned
  `2024-04-10` supports the Connect + Account Links calls used, or bump per the
  documented procedure.

---

## Provider B: Flutterwave

Current Flutterwave checkout posts to `/v3/payments` with `tx_ref`, `amount`
(major units), `currency`, `customer`, `meta`, and no split
(`apps/api/src/modules/payments/providers/flutterwave.provider.ts:51-89`).
Refunds resolve the numeric transaction id from `tx_ref` and POST to
`/v3/transactions/{id}/refund` (`flutterwave.provider.ts:210-241`). There is no
Flutterwave onboarding in the repo.

### B(a) Onboarding

Goal: create a Flutterwave subaccount for the organizer and store its returned id
in `payment_connected_accounts`, mirroring the Paystack onboarding shape
(`paystack-onboarding.service.ts:41-77`).

Mechanism (confirm against current Flutterwave docs): create a subaccount via the
Flutterwave subaccounts endpoint (historically `POST /v3/subaccounts`), passing
the organizer's settlement bank details and a split configuration, and keep the
returned `subaccount_id` (historically `data.subaccount_id`, an `RS_...`
reference). Unlike Stripe, this is a direct API create with no redirect, closer
to Paystack. Flutterwave has no per-account `charges_enabled` webhook in the way
Stripe does, so readiness is effectively "subaccount created successfully".

What gets stored (reuse `ConnectedAccountsService.record`):

- `provider: 'flutterwave'`
- `accountRef`: the subaccount id
- `status: 'active'` on successful create (there is no separate enablement step
  to wait on; confirm this against current docs)
- `chargesEnabled: true`, `payoutsEnabled: true` (Flutterwave gates payouts on
  its own KYC, not on a flag we poll; confirm)
- `metadata`: display-only bank + masked account + holder name, exactly as the
  Paystack onboarding stores (`paystack-onboarding.service.ts:68-75`).

`accountIsReady` (active + chargesEnabled, `connected-accounts.config.ts:16-21`)
therefore returns true immediately after a successful create.

### B(b) Checkout split

Mechanism (confirm against current Flutterwave docs): the `/v3/payments` body
takes a `subaccounts` array. Each entry references a subaccount id and specifies
how much the platform keeps. Flutterwave supports either a flat
`transaction_charge` (with `transaction_charge_type: 'flat'`) or a percentage.
Because Orkora computes an exact fee in minor units, the flat form is the correct
mapping:

```
subaccounts: [
  {
    id: input.subaccountCode,
    transaction_charge_type: 'flat',
    transaction_charge: toMajorUnit(input.platformFeeMinor),
  },
]
```

Field mapping:

- `input.subaccountCode` -> `subaccounts[0].id`.
- `input.platformFeeMinor` -> `subaccounts[0].transaction_charge`, converted with
  the existing `toMajorUnit(amountMinor)` (`money.ts:84-86`), because Flutterwave
  bills and splits in MAJOR units, not the smallest unit
  (`flutterwave.provider.ts:54-55` already converts the charge amount with
  `toMajorUnit`). This is the key difference from Stripe/Paystack, which use
  `toSmallestUnit`.
- Only attach `subaccounts` when `input.subaccountCode` is present, matching the
  Paystack guard.

The customer is still charged `input.amountMinor` in full, so the settlement gate
(`verifySettlementAmount`) is unaffected: the webhook/verify still report
`event.data.amount` as the full transaction amount
(`flutterwave.provider.ts:110-153`).

Interface impact: none required; `subaccountCode` and `platformFeeMinor` carry
everything. Confirm the exact field names (`transaction_charge_type`,
`transaction_charge`, and whether `id` or `subaccount_id` is expected inside the
array) against current docs, since Flutterwave has changed these across API
versions.

### B(c) Webhooks

Current Flutterwave webhook handling verifies the static `verif-hash` header and
handles `charge.completed` (and name variants) plus `refund.processed`
(`flutterwave.provider.ts:91-165`). For the split:

- No new event is strictly required for the money split itself: `charge.completed`
  still fires for a split charge and still reports the full `amount`
  (`flutterwave.provider.ts:133-153`). Confirm the split does not change the
  reported `amount`/`currency`.
- Onboarding readiness: Flutterwave does not emit a Stripe-style
  `account.updated`, so there is no new webhook to consume for the connected
  account. Readiness is set at create time (B(a)).
- Confirm whether a refund on a split transaction emits `refund.processed`
  unchanged (`flutterwave.provider.ts:160-162`).

### B(d) Refunds and fee reversal

Current refund POSTs `{ amount: toMajorUnit(input.amountMinor) }` to
`/v3/transactions/{id}/refund` (`flutterwave.provider.ts:222-232`). Confirm
against current docs how a refund interacts with a subaccount split: whether
refunding the full transaction automatically reverses the subaccount's share
proportionally (as Paystack does, per the comment at
`payments.service.ts:96-102`), or whether the platform's kept
`transaction_charge` must be returned separately. If Flutterwave reverses the
split automatically on a full refund, no code change is needed and
`refundBreakdownMinor` stays correct as-is. If not, the refund call may need an
extra parameter or a compensating step so the platform returns its whole fee
(the `PLATFORM_FEE_REFUNDABLE = true` policy, `platform-fee.ts:152`). This is the
single most important Flutterwave behavior to verify in test mode before the fee
goes live. `verifyRefund` (`flutterwave.provider.ts:250-271`) needs no change.

### B(e) Data model, config, env impact

- Table: reuse `payment_connected_accounts` unchanged; `accountRef` holds the
  Flutterwave subaccount id (migration comment at
  `0022_payment_connected_accounts.sql:8-9`).
- `ConnectedAccountsService.record` works as-is for Flutterwave, because a single
  `active` boolean correctly drives both flags (unlike Stripe, Flutterwave has no
  independent charges/payouts flags to track). No new method needed.
- No new columns.
- New env keys: none strictly required beyond the existing
  `FLUTTERWAVE_SECRET_KEY` and `FLUTTERWAVE_WEBHOOK_SECRET`
  (`flutterwave.provider.ts:40-41`), unless the subaccounts create needs a
  distinct key. Confirm.
- Flat-fee currency config: `PLATFORM_FEE_FLAT_<CUR>` env keys already exist for
  per-currency flat fees (`platform-fee.ts:119-130`), so Flutterwave's NGN/KES
  settlements are already covered by the same mechanism as Paystack.

### B(f) Files and functions to add or change (Flutterwave)

- `apps/api/src/modules/payments/providers/flutterwave.provider.ts`
  - `createCheckoutSession`: add the `subaccounts` array when `subaccountCode`
    is set (`flutterwave.provider.ts:51-72`).
  - `refund`: adjust only if the split is not auto-reversed on full refund
    (`flutterwave.provider.ts:210-241`).
  - New method `createSubaccount` for onboarding, mirroring
    `PaystackProvider.createSubaccount` (`paystack.provider.ts:361-394`), plus
    `listBanks` / `resolveAccount` if Flutterwave offers equivalents and we want
    a bank picker parity with Paystack (`paystack.provider.ts:305-351`).
- New `apps/api/src/modules/payments/flutterwave-onboarding.service.ts` and
  `flutterwave-onboarding.controller.ts` mirroring the Paystack pair (routes
  under `organizations/:orgId/payments/accounts/flutterwave`).
- `apps/api/src/modules/payments/payments.service.ts:315-329`: widen the split
  guard beyond `'paystack'` (same one-line change shared with Stripe).
- `apps/api/src/modules/payments/payments.module.ts:22-39`: register the new
  service and controller.

### B(g) Testing plan (Flutterwave)

- Unit specs mirroring `flutterwave.provider.spec.ts`
  (`apps/api/src/modules/payments/providers/flutterwave.provider.spec.ts`):
  - checkout includes `subaccounts` with `transaction_charge_type: 'flat'` and
    `transaction_charge === toMajorUnit(platformFeeMinor)` only when
    `subaccountCode` is present; omitted otherwise.
  - the split amount is in MAJOR units (the Flutterwave-specific pitfall), not
    smallest units.
  - refund behavior matches whatever B(d) confirms.
- Settlement gate: extend `settlement-amount.spec.ts` with a Flutterwave split
  case proving the full `amount` still settles.
- Test-mode manual checklist:
  1. Create a Flutterwave subaccount in test mode; confirm the row records as
     `active`/ready.
  2. Run a paid checkout with the gate on; confirm the subaccount is credited the
     amount minus fee and the platform keeps the flat `transaction_charge`.
  3. Confirm the customer paid the full order total (gate passes).
  4. Full refund; confirm the buyer is refunded in full and the platform's kept
     charge is returned (this is the behavior to verify, per B(d)).
  5. Confirm `refund.processed` still settles the order locally.

### B(h) Risks and unknowns to confirm against current Flutterwave docs

- The exact subaccounts endpoint and payload (field names have shifted across
  Flutterwave API versions). Confirm `POST /v3/subaccounts`, the returned id
  field, and the `subaccounts` array field names on `/v3/payments`.
- Whether a full refund automatically reverses the subaccount split (B(d)). This
  is the biggest correctness risk for the fee.
- Whether the flat `transaction_charge` on the split is in major units and
  whether it can exceed or must be less than the transaction amount (the caller
  already caps `platformFeeMinor` to the total, `payments.service.ts:325-327`).
- Payout/KYC readiness: Flutterwave may hold payouts on its own compliance state
  that we cannot see via a flag; confirm what "ready" means for a subaccount.
- Multi-currency: Flutterwave here supports NGN, USD, GHS, KES, ZAR, XAF, XOF
  (`flutterwave.provider.ts:33`). Confirm subaccount splits are supported for
  each, especially the zero-decimal XAF/XOF (the `toMajorUnit` conversion is
  already correct for those, `money.ts:44-47`).

---

## Effort estimate (rough person-days)

Stripe Connect:

- Provider changes (checkout split, refund fee reversal, `account.updated`): 2 to 3 days.
- Connect onboarding service + controller + redirect flow + readiness update
  method: 3 to 4 days.
- Connect webhook routing and idempotency for account events: 1 to 2 days.
- Unit + gate tests, test-mode verification: 2 days.
- Stripe subtotal: roughly 8 to 11 person-days.

Flutterwave:

- Provider changes (subaccounts split, refund verification): 1 to 2 days.
- Onboarding service + controller (direct API, no redirect): 2 days.
- Unit + gate tests, test-mode verification (including the refund-reversal
  question): 2 days.
- Flutterwave subtotal: roughly 5 to 6 person-days.

Shared:

- Widening the split guard in `payments.service.ts:317` and its test: under 1 day
  (do it once, both providers benefit).

Total: roughly 13 to 18 person-days across both providers, less if only one ships
first.

## Recommended build sequence

1. Shared: relax the `providerName === 'paystack'` split guard
   (`payments.service.ts:317`) to a capability set, with a test, so both new
   providers can be dropped in independently.
2. Flutterwave first. It is the smaller, lower-risk build: direct-API onboarding
   like Paystack, no redirect, no independent readiness webhook, and it reuses
   `ConnectedAccountsService.record` unchanged. The one open question (refund
   split reversal) is isolated and confirmable in test mode early.
3. Stripe Connect second. It is larger because of hosted onboarding (Account
   Links redirect), the `account.updated` readiness webhook, the need for a
   per-flag readiness update method, and the `refund_application_fee` /
   `reverse_transfer` refund semantics.
4. Only after both are verified in test mode, and the fee go-live checklist is
   closed, widen the go-live to production per the turn-on procedure in
   `apps/api/src/common/platform-fee.ts:16-23`.

Keep the two providers on separate branches/PRs so they remain independently
shippable, as scoped above.
