# Platform Fee Go-Live Checklist

An ordered, checkbox go-live checklist for switching on the Orkora platform fee
(3% of the ticket price plus a flat fee per paid ticket: NGN 1,350 for Naira,
USD 0.99 base). Paystack is the first live rail (NGN). This checklist is grounded
in FEE_GOLIVE_RUNBOOK.md, PLATFORM_FEE_ROLLOUT.md, FEE_NOTICE_DRAFT.md, and the
code that reads the fee (apps/api/src/common/platform-fee.ts,
apps/api/src/common/payments-flags.ts,
apps/api/src/modules/payments/connected-accounts.config.ts, and
apps/api/src/modules/events/events.service.ts createForOrg).

This document does not give legal advice. Every legal item below is framed as an
action for counsel, not a legal conclusion.

Stack facts this checklist assumes:
- API runs on Render (Docker web service orkora-api), autoDeploy on, with a
  forward-only migration runner (apps/api/scripts/migrate.mjs) that runs on boot.
- Web runs on Vercel.
- Paystack is the live NGN rail; it is the only provider with the fee split wired
  today (PLATFORM_FEE_ROLLOUT.md sections 3 and 4).
- The fee is stamped per event at creation via platformFeeAt() in
  events.service.ts createForOrg, so events created before the effective date stay
  at 0% for their whole life (grandfathering). No global switch, no retrofit.

---

## DO NOT FLIP UNTIL (hard blockers)

All four must be true before Phase 6. Do not set PLATFORM_FEE_EFFECTIVE_AT to a
live date until every box here is checked.

- [ ] 60-day notice period has elapsed. Effective date is at least 60 calendar
      days after the notice send date. (Terms sections 4 and 7;
      PLATFORM_FEE_ROLLOUT.md section 2; FEE_NOTICE_DRAFT.md) [Legal / Founder]
- [ ] Counsel has signed off on the fee mechanism, the legal binder, the updated
      Terms, the Refund Policy clause, and the organizer notice.
      (FEE_GOLIVE_RUNBOOK.md A; PLATFORM_FEE_ROLLOUT.md sections 5 and 6) [Legal]
- [ ] Legal entity registered and the corporate bank account is open and live.
      (FEE_GOLIVE_RUNBOOK.md A; PLATFORM_FEE_ROLLOUT.md section 5) [Founder]
- [ ] Provider TEST-mode split and refund verified end to end (split lands the fee
      on the platform account, organizer receives net, full refund reverses the
      split). (FEE_GOLIVE_RUNBOOK.md B; PLATFORM_FEE_ROLLOUT.md slice 4) [Eng]

Date math to record and re-check before the flip:
- notice send date + 60 calendar days = earliest lawful effective date.
- Worked example: notice sent 2026-09-28, plus 60 days, gives earliest effective
  date 2026-11-27. Set PLATFORM_FEE_EFFECTIVE_AT no earlier than that. This
  matches the ISO example in FEE_GOLIVE_RUNBOOK.md section C.

---

## Phase 1: Legal and entity prerequisites

- [ ] Register the legal entity so a corporate bank account can accept payouts.
      GATE: blocks the corporate bank account and all downstream phases.
      (PLATFORM_FEE_ROLLOUT.md section 5.1) [Founder]
- [ ] Open the corporate bank account. GATE: depends on the entity being
      registered. (FEE_GOLIVE_RUNBOOK.md A) [Founder]
- [ ] Instruct counsel to sign off on the fee mechanism chosen (Option A,
      connected accounts with a native split). GATE: blocks the flip.
      (PLATFORM_FEE_ROLLOUT.md sections 3 and 6) [Legal]
- [ ] Have counsel finalize the Refund Policy clause (a full refund returns the
      platform fee; in pass-on mode the attendee is refunded everything including
      the fee) and publish it at /legal/refunds. GATE: must be written before
      charging. (FEE_GOLIVE_RUNBOOK.md A; PLATFORM_FEE_ROLLOUT.md slice 4 and
      section 6) [Legal]
- [ ] Confirm tax treatment of the fee with the accountant (for example VAT on the
      service fee, and whether the stated fee is inclusive or exclusive), and feed
      any required wording into the notice and Terms. GATE: feeds the notice copy.
      (FEE_GOLIVE_RUNBOOK.md A; FEE_NOTICE_DRAFT.md notes for counsel) [Finance]
- [ ] Update Terms and billing copy to state the fee and its effective date, and
      remove the beta 0% wording (do not remove the "advisory only" wording until
      the fee is genuinely live in Phase 6). GATE: depends on counsel sign-off and
      the chosen effective date. (FEE_GOLIVE_RUNBOOK.md A;
      PLATFORM_FEE_ROLLOUT.md section 5.5) [Legal / Founder]
- [ ] Have counsel review and finalize the organizer notice (FEE_NOTICE_DRAFT.md),
      filling EFFECTIVE_DATE, TERMS_URL, and SUPPORT_EMAIL, and confirm it
      satisfies the Terms sections 4 and 7 notice obligation. GATE: blocks sending
      the notice. (FEE_NOTICE_DRAFT.md) [Legal]
- [ ] Send the 60-day written notice to every organizer account from a monitored
      address (for example billing@orkora.events) and RECORD THE SEND DATE. GATE:
      starts the 60-day clock; the effective date must be at least 60 days later.
      (FEE_GOLIVE_RUNBOOK.md A; FEE_NOTICE_DRAFT.md; PLATFORM_FEE_ROLLOUT.md
      section 5.4) [Founder]
- [ ] Record the earliest lawful effective date: send date + 60 calendar days.
      Example: send 2026-09-28, earliest effective 2026-11-27. GATE: this date
      feeds PLATFORM_FEE_EFFECTIVE_AT in Phase 6. (Terms sections 4 and 7)
      [Founder]

## Phase 2: The one open product decision

- [ ] Decide the flat-fee currency policy: charge the flat fee in USD, or convert
      it to the sale currency at settlement. The code never invents an exchange
      rate: a currency only carries a flat fee if PLATFORM_FEE_FLAT_<CUR> is set
      for it, otherwise only the 3% applies (platform-fee.ts
      PLATFORM_FEE_FLAT_BY_CURRENCY and flatFeeMinorForCurrency). For NGN the
      decision is already made concrete as PLATFORM_FEE_FLAT_NGN=135000
      (1,350.00 NGN in kobo). GATE: determines which PLATFORM_FEE_FLAT_<CUR> keys
      are set in Phase 4, and it is stamped per event, so decide before the flip.
      (PLATFORM_FEE_ROLLOUT.md intro and slice 3) [Founder / Finance]

## Phase 3: Connected-accounts readiness

- [ ] Complete Paystack business verification (KYC) and obtain live keys. GATE:
      blocks live Paystack settlement. (FEE_GOLIVE_RUNBOOK.md A) [Ops / Founder]
- [ ] Enable Paystack subaccounts / splits on the live account. GATE: the fee
      split runs only through a subaccount. (FEE_GOLIVE_RUNBOOK.md A;
      PLATFORM_FEE_ROLLOUT.md slice 3) [Ops / Eng]
- [ ] Onboard each selling organizer to a payout account: create the Paystack
      subaccount (list settlement banks, resolve the account number, connect) so
      each org has a ready connected account. An account is ready only when it is
      active and charges are enabled (connected-accounts.config.ts accountIsReady).
      GATE: with PAYMENTS_CONNECTED_ACCOUNTS on, a paid checkout is blocked for any
      org without a ready account. (PLATFORM_FEE_ROLLOUT.md slice 2) [Ops]
- [ ] Confirm provider coverage: only Paystack currencies (NGN, GHS, KES, ZAR)
      can carry the fee today, because Paystack is the only provider with the split
      wired. The Flutterwave split is PENDING (in build) and must not be switched
      on for the fee until it ships. Stripe Connect is NOT BEING PURSUED
      (decision 2026-10-07; Stripe stays disabled with STRIPE_SECRET_KEY unset).
      GATE: do not enable the fee for any currency that settles through
      Flutterwave until its split ships, and never through Stripe.
      (FEE_GOLIVE_RUNBOOK.md notes; PLATFORM_FEE_ROLLOUT.md sections 3 and 4) [Eng]

## Phase 4: Engineering config (ENV MATRIX)

Set these on the Render orkora-api service (Environment tab in the Render
dashboard). Note: render.yaml declares the provider secret keys as sync:false
(pasted in the dashboard) but does NOT declare PAYMENTS_CONNECTED_ACCOUNTS or any
PLATFORM_FEE_* key, so add those as new dashboard env vars. These are read at boot
by platform-fee.ts and payments-flags.ts; a redeploy is required for changes to
take effect. Do not set the live effective date until Phase 6.

| Env key | Set to (example) | Where it is set | Notes |
| --- | --- | --- | --- |
| PLATFORM_FEE_EFFECTIVE_AT | 2026-11-27 (ISO 8601) | Render dashboard (orkora-api) | The effective date from the notice. Must be >= send date + 60 days, never a past date. Leave UNSET or future until the Phase 6 flip. (platform-fee.ts) |
| PLATFORM_FEE_BPS | 300 | Render dashboard (orkora-api) | 300 bps = 3%. Optional; defaults to 300 if unset. (platform-fee.ts) |
| PLATFORM_FEE_FLAT_MINOR | 99 | Render dashboard (orkora-api) | Base flat fee per paid ticket in the base currency's minor units. Optional; defaults to 99. (platform-fee.ts) |
| PLATFORM_FEE_FLAT_CURRENCY | USD | Render dashboard (orkora-api) | Currency of the base flat fee. Optional; defaults to USD. (platform-fee.ts) |
| PLATFORM_FEE_FLAT_NGN | 135000 | Render dashboard (orkora-api) | 1,350.00 NGN in kobo. Required for the NGN flat fee to apply; without it only the 3% applies to NGN. (platform-fee.ts PLATFORM_FEE_FLAT_BY_CURRENCY) |
| PLATFORM_FEE_FLAT_&lt;CUR&gt; | (per settlement currency, minor units) | Render dashboard (orkora-api) | Add one per additional settlement currency you enable, per the Phase 2 decision. No key means no flat fee for that currency (no invented FX rate). (platform-fee.ts) |
| PAYMENTS_CONNECTED_ACCOUNTS | 1 | Render dashboard (orkora-api) | Turns on the split and the connected-account gate. The fee is only taken when this is 1. (payments-flags.ts connectedAccountsEnabled) |
| PAYSTACK_SECRET_KEY | (live secret key) | Render dashboard (orkora-api, sync:false) | Paystack live key. (render.yaml; FEE_GOLIVE_RUNBOOK.md C) |
| PAYSTACK_WEBHOOK_SECRET | (live webhook secret) | Render dashboard (orkora-api, sync:false) | Paystack live webhook secret. (render.yaml; FEE_GOLIVE_RUNBOOK.md C) |

- [ ] Enter every applicable row above in the Render dashboard, keeping
      PLATFORM_FEE_EFFECTIVE_AT unset or future until the Phase 6 flip. [Eng]
- [ ] Confirm no currency that settles through Flutterwave has a
      PLATFORM_FEE_FLAT_<CUR> key set until its split ships, and confirm
      STRIPE_SECRET_KEY is unset so no currency can settle through Stripe. [Eng]

## Phase 5: Pre-flip verification in provider TEST mode

Do this once, on a non-production environment with Paystack TEST keys, before any
live flip. (FEE_GOLIVE_RUNBOOK.md B; PLATFORM_FEE_ROLLOUT.md slice 4)

- [ ] Connect a payout account (subaccount), create a paid NGN event, and register
      with a test card (split checkout). PASS / FAIL: __________ [Eng]
- [ ] Confirm the split in the Paystack dashboard: the subaccount receives the net
      and the main (platform) account receives the fee. PASS / FAIL: __________
      [Eng / Finance]
- [ ] Refund the order in full (split refund) and confirm the buyer is refunded
      the full amount AND the platform fee is clawed back from the main account
      (the split reverses), not the whole refund off one account. If it behaves
      differently, STOP and report before going live. PASS / FAIL: __________
      [Eng / Finance]

## Phase 6: The flip (production, no code change)

Do not start until every DO NOT FLIP UNTIL box is checked and Phase 5 passed.
(FEE_GOLIVE_RUNBOOK.md C; PLATFORM_FEE_ROLLOUT.md section 5.6)

- [ ] Set PLATFORM_FEE_EFFECTIVE_AT to the effective date from the notice (at least
      60 days after the send date; example 2026-11-27), confirm PLATFORM_FEE_FLAT_NGN
      =135000 and PAYMENTS_CONNECTED_ACCOUNTS=1 are set, and confirm live Paystack
      keys are present. GATE: notice period elapsed. [Eng / Founder]
- [ ] Redeploy / restart orkora-api on Render so the new environment is read (the
      migration runner runs on boot; env changes need a fresh boot). GATE: env set
      above. (render.yaml; FEE_GOLIVE_RUNBOOK.md C) [Eng]
- [ ] Create a brand-new paid NGN event through the dashboard and confirm it is
      stamped with the fee (platformFeeBps = 300, flat set, and the pass-on
      choice), via platformFeeAt() in createForOrg. PASS / FAIL: __________
      (FEE_GOLIVE_RUNBOOK.md D; events.service.ts createForOrg) [Eng / Ops]
- [ ] Confirm an event created BEFORE the effective date still shows 0% and charges
      no fee (grandfathering holds). PASS / FAIL: __________
      (FEE_GOLIVE_RUNBOOK.md D) [Eng / Ops]
- [ ] Run one real paid registration in each mode: absorb (attendee pays the ticket
      price, fee from proceeds) and pass-on (attendee sees and pays the fee, org
      receives full ticket price), and confirm the register page shows the service
      fee before checkout for the pass-on event. PASS / FAIL: __________
      (FEE_GOLIVE_RUNBOOK.md D) [Ops / Eng]
- [ ] Confirm a real refund makes the buyer whole and returns the fee. PASS / FAIL:
      __________ (FEE_GOLIVE_RUNBOOK.md D) [Finance / Eng]
- [ ] Remove the "advisory only" and beta wording from the billing page now that
      the fee is genuinely live. (FEE_GOLIVE_RUNBOOK.md D;
      PLATFORM_FEE_ROLLOUT.md section 5.6) [Founder / Eng]

## Phase 7: Post-flip monitoring

- [ ] For the first 72 hours and through the first live settlement cycle, watch new
      paid orders: confirm feesMinor is recorded (not 0) on split orders, the fee
      lands on the platform account, and organizers receive net. [Eng / Finance]
- [ ] Watch Paystack webhooks and Sentry (SENTRY_DSN) for split, verify-on-return,
      and refund errors; watch for any paid checkout blocked because an org lacks a
      ready connected account. [Eng / Ops]
- [ ] Reconcile the first days of platform-fee revenue against Paystack settlement
      reports; confirm refunded orders are excluded from fee revenue. [Finance]
- [ ] Monitor organizer support for fee, payout, and refund questions through the
      first settlement cycle. [Ops]

## Phase 8: Rollback

- [ ] To pause the fee, unset PLATFORM_FEE_EFFECTIVE_AT (or set it to a future
      date) and redeploy orkora-api. New events created after that revert to 0%.
      (FEE_GOLIVE_RUNBOOK.md E; platform-fee.ts) [Eng]
- [ ] To stop requiring connected accounts for paid checkout, unset
      PAYMENTS_CONNECTED_ACCOUNTS and redeploy. Note this also stops the fee being
      taken, because the split runs only when the gate is on.
      (FEE_GOLIVE_RUNBOOK.md E; payments-flags.ts) [Eng]
- [ ] In-flight and already-created events: events keep the fee they were stamped
      with at creation. Rollback does not change their fee (grandfathering is
      permanent per event), and it does not retroactively alter orders already
      placed. Confirm no attempt is made to retrofit or strip fees on existing
      events. (FEE_GOLIVE_RUNBOOK.md E; PLATFORM_FEE_ROLLOUT.md section 7)
      [Eng / Finance]
