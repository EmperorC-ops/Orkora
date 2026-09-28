# Platform Fee Go-Live Runbook

A checklist to turn the platform fee on in production. The engineering is done and
inert; this covers the operator steps. Do not start the turn-on step until the
prerequisites and the 60-day notice period are complete. See PLATFORM_FEE_ROLLOUT.md
for the full plan and FEE_NOTICE_DRAFT.md for the notice.

Fee being enabled: 3% of the ticket price plus a flat per paid ticket (NGN 1,350
for Naira, USD 0.99 base). Paystack is the first live provider.

## A. Prerequisites (must all be true before turn-on)

- [ ] Legal entity registered, and corporate bank account open.
- [ ] Counsel has signed off on the legal binder.
- [ ] Refund Policy clause added (full refund returns the platform fee; in
      pass-on mode the attendee is refunded everything including the fee).
- [ ] Tax treatment of the fee confirmed with the accountant (for example VAT on
      the service fee, and whether the stated fee is inclusive or exclusive).
- [ ] Terms and billing copy updated to state the fee and its effective date, and
      the beta 0% wording removed.
- [ ] 60-day written notice sent to organizers, send date recorded. Effective
      date chosen is at least 60 days after that.
- [ ] Paystack business verification (KYC) complete and live keys issued.
- [ ] Paystack subaccounts / splits enabled on the live account.

## B. Paystack test-mode verification (do once, before live)

- [ ] With Paystack test keys on a non-production environment, connect a payout
      account, create a paid NGN event, and register with a test card.
- [ ] Confirm the split in the Paystack dashboard: the subaccount receives the net
      and the main account receives the fee.
- [ ] Refund the order and confirm two things: the buyer is refunded the full
      amount, and the platform fee is clawed back from the main account (the split
      reverses) rather than the whole refund coming off one account. If it behaves
      differently, stop and report it before going live.

## C. Turn-on (production, no code change)

On the production API host environment, set:

- [ ] `PLATFORM_FEE_EFFECTIVE_AT` = the effective date from the notice (ISO date,
      for example 2026-11-27). Not a past date.
- [ ] `PLATFORM_FEE_FLAT_NGN=135000` (1,350.00 NGN in kobo). Add a
      `PLATFORM_FEE_FLAT_<CUR>` for any other currency you will settle in.
- [ ] `PAYMENTS_CONNECTED_ACCOUNTS=1`.
- [ ] Paystack live keys set (`PAYSTACK_SECRET_KEY`, and the webhook secret).
- [ ] Redeploy / restart the API so the new environment is read.

## D. Verify after turn-on

- [ ] Create a brand-new paid NGN event through the dashboard. Confirm it is
      stamped with the fee (platform_fee_bps = 300, flat 99 USD, and your pass-on
      choice).
- [ ] Confirm an event created before the effective date still shows 0% and does
      not charge a fee (grandfathering).
- [ ] Run one real paid registration in each mode: absorb (attendee pays the
      ticket price, fee taken from proceeds) and pass-on (attendee sees and pays
      the fee, you receive the full ticket price).
- [ ] Confirm the register page shows the service fee before checkout for a
      pass-on event.
- [ ] Confirm a real refund makes the buyer whole and returns the fee.
- [ ] Remove the "advisory only" and beta wording from the billing page once the
      fee is genuinely live.

## E. Rollback

- [ ] To pause the fee, unset `PLATFORM_FEE_EFFECTIVE_AT` (or set it to a future
      date) and redeploy. New events created after that revert to 0%. Events
      already created keep the fee they were stamped with, which is correct; the
      fee they carry is grandfathered and does not change on rollback.
- [ ] To stop requiring connected accounts for paid checkout, unset
      `PAYMENTS_CONNECTED_ACCOUNTS`. Note this also stops the fee being taken,
      since the split runs only when the gate is on.

## Notes

- Only Paystack currencies (NGN, GHS, KES, ZAR) can be enabled for the fee today,
  because Paystack is the only provider with the split wired. Stripe and
  Flutterwave splits are future work.
- The flat fee for a currency applies only when a `PLATFORM_FEE_FLAT_<CUR>` value
  is set for it; otherwise only the 3% applies to that currency. No exchange rate
  is ever guessed.
