# Platform Fee Rollout Plan (3% + 0.99 USD per paid ticket)

Status: planning only. Nothing in this document charges a fee. It sets out what
is true today, the legal gate from Orkora's own terms, the one architectural
decision everything hinges on, and the engineering and rollout sequence to
introduce the platform fee correctly.

The fee structure is **3% of the sale plus a flat 0.99 USD per paid ticket**.
Both components are captured per event at creation (see slice 1) so both are
grandfathered together. The flat component is per paid ticket, not per order, so
it scales with ticket count. It is denominated in USD; because events sell in
many currencies, whether it is charged in USD or converted to the sale currency
at settlement is an open decision resolved when the fee is implemented (the
currency is stored per event so the choice is not lost).

This is not legal advice. Two items below (entity registration and counsel
sign-off) are for the team and its lawyer to close.

## 1. Where things stand today (verified in code)

- No platform fee is charged. Every order is created with `feesMinor = 0`
  (`apps/api/src/modules/registrations/registrations.service.ts`), and the order
  total is `subtotal - discount` with nothing added.
- The 3% figure that appears on the billing page is advisory display only.
  `apps/api/src/modules/billing/billing.service.ts` defines
  `PLATFORM_FEE_BPS = 300` and uses it to show a "notional fee", with a note that
  says the fee is 0% during beta. It never touches the money path.
- Payments themselves are production-grade: Stripe, Paystack, and Flutterwave all
  implement checkout, signature-verified webhooks, verify-on-return, and refunds.
- Crucially, funds today run through a single central Orkora account per provider
  (one set of API keys in the environment). There is no per-organizer connected
  account, no subaccount, and no fee-split anywhere in the payments module. The
  `PaymentProviderPreference` table stores only which provider a currency uses,
  not any organizer account id.

That last point is the single most important fact for this plan, and it is
covered in section 3.

## 2. The legal gate (from Orkora's published terms)

Orkora's own Terms of Service already constrain how a fee can be introduced. From
`apps/web/legal/terms.md`:

- Section 4 and Section 7: "at least 60 calendar days written notice before
  introducing any platform fee on ticket sales."
- Section 4: "Existing events will continue at the fee structure in effect at the
  time the event was created until that event ends." So events already created
  must stay at 0% until they end. The fee can only attach to events created on or
  after the effective date.
- Section 7: during beta Orkora charges no platform fee, funds settle directly to
  the organizer's connected account, and Orkora does not hold customer funds.

Consequences for the plan:

1. The fee cannot turn on the same day it is decided. A written notice must go to
   organizers first, and the effective date must be at least 60 days after that
   notice.
2. The fee applies by event creation date, not globally. This is a grandfathering
   rule that has to be built into the data model, not applied by a single switch.
3. The terms promise funds settle directly to the organizer and that Orkora does
   not hold funds. Honoring that promise while taking a 3% cut is what section 3
   is about.

## 3. The architectural decision everything depends on

To take 3% of a sale, the money has to split. There are two ways to do that, and
they are very different in build size and in legal exposure.

### Option A: Connected accounts with a native split (recommended)

Each organizer connects their own account with the payment provider, and the 3%
is taken automatically at settlement as a platform/application fee:

- Stripe: Stripe Connect, using an application fee on a destination charge so the
  organizer's connected account receives the net and Orkora receives the fee.
- Paystack: subaccounts with a split, so the organizer's subaccount is paid and
  Orkora's share is retained.
- Flutterwave: subaccounts with a split, same shape.

(Confirm the exact parameters against each provider's current Connect / subaccount
documentation before building; the mechanism names above are stable but field
details change.)

Why this is the right path: it matches the terms exactly. Funds settle directly
to the organizer's own account, Orkora never holds customer funds, and the 3%
arrives as a clean platform fee with a provider-issued record. Refunds and
chargebacks are handled by the provider against the right account.

What it costs: this is the real build. It needs per-organizer onboarding and KYC
with each provider, storage of the connected-account / subaccount ids per org and
currency, checkout changes to route the split, and refund logic that returns or
withholds the fee per policy.

### Option B: Central collection, then payout minus 3%

Keep collecting into Orkora's central account (as today) and pay each organizer
their balance minus 3% on a schedule.

Why to avoid it: this means Orkora holds customer funds, which directly
contradicts Terms Section 7 and typically triggers money-transmission / payment-
institution licensing, trust-account, and tax-withholding obligations. It is not
a shortcut; it is a heavier regulated path. Do not take this route without
specific legal and licensing advice.

Recommendation: build Option A. The rest of this plan assumes it.

## 4. Engineering slices (Option A)

Each slice is shippable behind a flag with the fee still at 0, so nothing charges
until the effective date.

1. Fee data model and grandfathering. Add `platformFeeBps`, `platformFeeFlatMinor`
   and `platformFeeFlatCurrency` to the Event, stamped at event creation from the
   platform's then-current fee (all zero today; 300 bps + 99 USD-minor later). A
   small platform-level config holds the planned fee and its effective date.
   Because the fee is captured per event at creation, grandfathering is automatic
   and permanent. (Built.)
2. Connected accounts. Org-level connection per provider, storing the account /
   subaccount id and its readiness, plus a gate that blocks a paid checkout in a
   currency until the org has a ready account for the resolved provider.
   - Backbone (built): the `payment_connected_accounts` table, a service and
     organizer endpoints under `organizations/:orgId/payments/accounts` to view
     status, record an account, and disconnect, and the checkout gate. The gate
     is behind `PAYMENTS_CONNECTED_ACCOUNTS`, off by default, so today's paid
     flows are unchanged. A manual / admin record path exists so an operator can
     store a provider account id before the programmatic flow lands.
   - Live provider onboarding (pending, needs keys and testing): create a Stripe
     Connect account and account link, create Paystack and Flutterwave
     subaccounts, and consume each provider's account.updated webhook to keep the
     stored readiness flags accurate. This is where the real provider API calls
     live and cannot be exercised without live credentials.
3. Split at checkout. Change each provider's checkout creation to attach the
   application fee / subaccount split, computed from the event's stamped fee
   (percentage on the sale plus the flat amount times the paid-ticket count,
   applying the stored flat-fee currency policy). Record the real fee on the
   order (`feesMinor`) instead of 0.
4. Refunds with fee handling. Decide and implement whether the platform fee is
   returned on a refund (define this in the Refund Policy first), and make each
   provider's refund path do the right thing.
5. Reporting. Flip billing from notional to actual: the billing page, receipts,
   and organizer statements show the real fee, and reconciliation includes it.
6. Turn-on. The order math starts adding the fee only when the event's
   stamped fee is greater than zero, which only happens for events created on or
   after the effective date. No global switch.

## 5. Rollout sequence (honors the 60-day notice)

1. Close the two non-code prerequisites: register the legal entity for corporate
   banking, and get counsel sign-off on the legal binder (still marked draft).
2. Set live provider keys for every currency to be sold, and enable Connect /
   subaccounts on each provider account.
3. Build slices 1 to 6 behind a flag, fee still 0 everywhere. Test end to end in
   the providers' test modes.
4. Send the written 60-day notice to organizers. Record the send date. Set the
   fee effective date to at least 60 days after it.
5. Update the terms and the billing copy to state the upcoming fee and its
   effective date. Still do not charge.
6. On the effective date, set the planned fee live (300 bps + 0.99 USD per paid
   ticket) by setting the effective date in the fee config. From that moment new
   events are created carrying that fee; every event created before it stays at
   zero until it ends. Remove the "advisory only" and beta wording once the fee
   is genuinely live.

## 6. Prerequisites checklist

- Legal entity registered (needed for corporate banking to accept payouts).
- Counsel sign-off on the legal binder and on the fee mechanism chosen.
- Live provider keys and webhook secrets set for each currency.
- Connect / subaccounts enabled on each provider account.
- Refund-of-fee policy decided and written into `/legal/refunds` before charging.

## 7. Do not do these

- Do not set `feesMinor` to 3% globally or retrofit a fee onto existing events.
  That breaks the grandfathering promise in Terms Section 4.
- Do not switch the fee on without the 60-day notice having run.
- Do not collect centrally and pay out minus a fee without specific licensing and
  legal advice (Option B risk).
