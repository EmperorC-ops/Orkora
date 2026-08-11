# Billing enforcement slice, scope

Status: proposed. Prepared 2 August 2026. Owner: TBD.

Turn Orkora's pricing from advisory into enforced, matching the go-to-market tiers
now published on `/pricing`: Standard (3% + $0.99 per paid ticket), Pro ($99 / month
+ 2% per paid ticket, plus the brand layer), and Enterprise (custom). Free events
stay free. Fees apply to paid tickets only and come out of organizer settlement, never
added to the attendee price.

## What already exists (build on, do not rebuild)

- `Organization.plan` field on the org model, currently informational.
- `PLATFORM_FEE_BPS` constant and a per-order notional fee computed in
  `apps/api/src/modules/billing/billing.service.ts`. The dashboard billing page shows
  it as advisory ("advisory only during private beta").
- Provider registry with verify-on-return settlement across Stripe, Paystack, and
  Flutterwave, plus a reconciliation cron and refund settlement.
- `apps/web/lib/pricing.ts`, the single source of truth for tier definitions.
- Feature flags (`apps/web/lib/flags.ts`) currently gate Brand Home, Story Mode, and
  Shareable Cards. These become plan gates.

So the accrual math and the settlement hook already exist. This slice makes the fee
real, adds the Pro subscription, gates Pro features by plan, and collects the money.

## The three decisions to lock before building

These are the crux. Everything downstream depends on them.

1. Fee collection mechanism. Two viable models:
   - Invoice in arrears (recommended MVP): meter the per-ticket fee per paid order into
     a ledger, then bill the organizer monthly (Stripe Invoicing in USD, or a provider
     charge in local currency). Provider-agnostic, works the same for Stripe, Paystack,
     and Flutterwave, and keeps organizer payouts untouched.
   - Split at settlement: take the fee at charge time via Stripe Connect application
     fees, Paystack subaccounts/split, and Flutterwave subaccounts. Cleaner cash flow
     but a different integration per provider and a heavier lift. Recommend as a later
     optimization, USD/Stripe first.
2. Currency of the fixed amounts. The $0.99 per-ticket and $99 per-month base need a
   defined price point per settlement currency (NGN, GHS, KES) or an FX rule. Decide
   fixed local price points (cleanest, no FX drift) versus live FX off USD.
3. Cutover and grandfathering. The explainer commits to at least 60 days written notice
   before any platform fee and to grandfathering existing events at the fee in effect at
   creation. The enforcement flip must honor both: a `BILLING_ENFORCEMENT` flag to dark
   launch, a per-event captured fee rate at publish time, and a notice workflow.

## Phased plan

Phase 0, plan model and config
- Migration: `Organization.plan` becomes an enum (standard | pro | enterprise), default
  standard; add `plan_status`, `plan_since`, and optional `custom_fee_bps` for Enterprise.
- Central billing config: per-plan fee bps + fixed per-ticket amount per currency, and the
  Pro base price per currency. Mirror the numbers already in `lib/pricing.ts`.
- No behavior change yet. Backfill existing orgs to standard.

Phase 1, fee metering ledger
- New `platform_fee_ledger` table: one row per paid order, currency, gross minor, fee bps
  and fixed applied, fee minor, plan at time, event id, captured fee rate. Idempotent on
  order id.
- Write a ledger row at `settleOrder` time (the existing settlement hook), replacing
  "notional" with "accrued". Free tickets accrue zero.
- Reverse or reduce the accrued fee when an order is refunded (reuse refund settlement).
- Reconciliation: extend the existing cron to assert ledger totals match settled orders.
- Still not charged. This makes the number real and auditable.

Phase 2, Pro subscription
- Stripe Billing: a $99/month product/price (USD to start), Checkout to subscribe, and the
  billing portal for card management. Webhooks set `Organization.plan = pro` and
  `plan_status` on subscription created/updated/canceled, idempotent, signature-verified.
- For NGN/GHS/KES orgs, either bill the base in USD via Stripe or add a Paystack plan in
  local currency (depends on decision 2).
- Downgrade path: on cancel, revert to standard at period end.

Phase 3, fee collection (per decision 1)
- MVP invoice-in-arrears: monthly job aggregates the ledger per org per currency and raises
  an invoice (Stripe Invoicing for USD; provider charge or manual invoice for local
  currency), with a statement the organizer can see and export.
- Records payment status back to the ledger; dunning for failed collection.

Phase 4, plan gating
- Convert the Brand Home / Story Mode / Shareable Cards / Campaigns gates from feature flags
  to plan checks (Pro and above). Server-enforced on the API, reflected in the web UI with
  upgrade prompts. Standard keeps the full ticketing and operations feature set.

Phase 5, dashboard billing upgrades
- Surface: current plan, accrued fees this period per currency, next invoice estimate,
  upgrade to Pro (Checkout), manage card (portal), downgrade. Reuse `lib/pricing.ts` so the
  tiers stay in one place. The provider-agnostic footnote is already wired in.

Phase 6, Enterprise
- Superadmin sets `plan = enterprise` and `custom_fee_bps`; invoicing handled offline via
  contract. No self-serve path.

## Cross-cutting requirements

- Idempotency on every webhook and ledger write; reconciliation parity checks.
- Refund correctness: refunding a paid order reverses its accrued platform fee.
- Feature flag `BILLING_ENFORCEMENT` to dark launch the whole slice; superadmin override.
- Receipts and NDPR: fee lines on organizer statements, retention per policy.
- Tax and VAT posture for the platform fee and the Pro subscription (needs finance input).
- Tests: ledger accrual, refund reversal, subscription webhook state machine, plan gating
  authorization (a Standard org cannot reach Pro-only endpoints).

## Recommended MVP and sequencing

MVP that makes pricing real without the hardest parts: Phase 0, Phase 1, Phase 2, Phase 4.
That gives enforced Pro subscriptions, plan-gated brand features, and a fully metered
per-ticket fee ledger visible to organizers, while fee collection (Phase 3) starts as a
monthly statement and graduates to automated invoicing or at-source split later.

Rough effort: Phase 0 small, Phase 1 medium, Phase 2 medium to large (Stripe Billing +
webhooks + local-currency question), Phase 3 large, Phase 4 medium, Phase 5 medium, Phase 6
small. The heavy items are Stripe Billing wiring and the multi-currency collection model.

## Open items for you to confirm

- Fee collection model: invoice in arrears (recommended) or split at settlement.
- Fixed-amount currency handling: local price points or FX off USD.
- When to flip from beta 0% to enforced, and the grandfathering rule to encode.
- Whether the Pro base is billed in USD globally or per local currency.
