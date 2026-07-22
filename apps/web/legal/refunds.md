# Refund Policy

**DRAFT FOR COUNSEL REVIEW.** Defaults applied per LEGAL_REVIEW_PACKET.md §2. Reflects the actual refund mechanics shipped in the platform.

**Last updated:** 8 July 2026 (draft)

This Policy is issued by **Orkora Technologies Limited**, a registered Nigerian company (RC **9697234**) and a wholly-owned subsidiary of **VoltAfrica Technologies Limited**. It applies to the Orkora event-management platform at `orkora.events`.

## 1. Scope

This Policy describes how refunds work on the Orkora platform. Two refund flows exist:

1. **Organiser-initiated refunds**: the event organiser refunds an attendee's order from the dashboard.
2. **Attendee-initiated refund requests**: the attendee contacts the organiser to request a refund. The organiser then issues it from the dashboard.

Orkora does not process refunds directly to attendees; refunds are initiated by the organiser and settled through the original payment provider. Orkora ensures the refund settles correctly, that the attendee receives a refund confirmation, and that the corresponding tickets are voided so they cannot be reused at the door.

## 2. Eligibility

Eligibility for a refund depends on the organiser's own refund terms, which the organiser must publish on the event page before selling tickets. Orkora does not set a platform-wide eligibility rule.

If the organiser has not published refund terms by the time of sale, the default rule under this Policy applies: **refunds are at the organiser's discretion**.

## 3. How a refund settles

When an organiser initiates a refund:

1. Orkora marks the order `refund_initiated` and records a timestamp in the audit log.
2. Orkora calls the payment provider (Stripe, Paystack, or Flutterwave) to refund the original payment. The provider returns one of three outcomes: settled, pending, or failed.
3. If settled, Orkora marks the order `refunded`, voids the attendee's tickets, sends a refund confirmation email to the attendee, and writes an audit row.
4. If pending, Orkora retries verification through a scheduled reconciliation sweep that runs hourly. The order stays in `refund_initiated` until the provider confirms settle or definitively fails.
5. If failed, Orkora marks the order `refund_failed`, surfaces the failure to the organiser in the dashboard, and offers a manual re-check button that re-queries the provider.

The reconciliation sweep is the safety net: if the provider's webhook to Orkora is missed, the sweep catches the settled refund and runs the same finishing logic. Each finishing path uses a unique-constraint-backed lock so the refund confirmation email is sent exactly once and the audit row is written exactly once.

## 4. Voiding of tickets

When a refund settles, all tickets associated with the refunded order are voided. Voided tickets fail at the check-in scanner with a clear "this ticket was refunded" message. The signed QR token on a voided ticket remains valid as a token, but the server-side ticket record is in the `refunded` state and the scanner uses that state, not the token alone, to decide entry.

If the attendee has already checked in before the refund is initiated, the check-in record remains but the ticket flips to `refunded`. The organiser sees both states in the attendee detail panel.

## 5. Partial refunds

The platform does not currently support partial refunds. A refund is either for the full original order amount or it is not issued at all. If an organiser needs to refund a fractional amount, they must do so out-of-band through the payment provider's dashboard; Orkora will not be aware of an out-of-band refund and the ticket state will not change.

[COUNSEL NOTE: this is an explicit statement of a current limitation. We considered being silent on partial refunds, but transparency is better.]

## 6. Platform fees on refunds

During the private beta, **Orkora does not charge a platform fee on ticket sales**, so there is no Orkora platform fee to refund or retain on a refunded order. The payment provider's processing fees may or may not be returned by the provider depending on the provider's own policy; this is between the organiser and the provider.

When Orkora introduces a platform fee at general availability, this Section will be updated to describe how the fee is treated on refunds, with at least 60 days' notice as per the Terms of Service.

## 7. Refund timing

Once Orkora marks an order `refunded`, the funds typically reach the attendee's original payment method within:

- **Stripe (card)**: 5 to 10 business days.
- **Paystack (card or bank transfer)**: 1 to 14 business days depending on the issuing bank.
- **Flutterwave (card, bank transfer, USSD)**: 1 to 14 business days depending on the rail.

These timings are set by the payment provider and the attendee's bank; Orkora has no control over them. The refund confirmation email Orkora sends includes this expected window.

## 8. Chargebacks

If you initiate a chargeback against an organiser through your bank instead of asking the organiser for a refund, the payment provider's chargeback process takes over and Orkora's refund mechanics are bypassed. Chargebacks impose a fee on the organiser, often reduce the organiser's standing with the payment provider, and may prevent the organiser from running future events on the platform.

We respectfully encourage you to contact the organiser first. Their dashboard surfaces refund requests immediately. If the organiser does not respond within 5 business days, contact hello@orkora.events and we will help.

[COUNSEL NOTE: confirm "discouraging" language above is permissible in our consumer-protection jurisdictions. Wording deliberately softer than "do not chargeback".]

## 9. Disputes about a refund

If you and the organiser disagree about whether a refund is owed, the dispute is between you and the organiser. Orkora can facilitate by surfacing the order and refund history in the dashboard but is not a party to the dispute. If you cannot reach agreement, you may contact your payment provider or your local consumer-protection authority.

## 10. Contact

- Refund mechanics, technical issues: hello@orkora.events
- Disputes you cannot resolve with the organiser: hello@orkora.events (with the order id)
