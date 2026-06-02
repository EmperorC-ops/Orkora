export const metadata = { title: 'Refund Policy - Orkora' };

const LAST_UPDATED = '2 June 2026';

/**
 * COUNSEL REVIEW CHECKLIST (delete this comment before public launch)
 * ------------------------------------------------------------------
 * 1. Replace every [BRACKETED VALUE].
 * 2. Confirm sec. 6 (Platform fees on refund) reflects the actual
 *    billing model once GA pricing is set. Current default during beta
 *    is "no platform fee, so nothing to retain".
 * 3. Confirm chargeback language (sec. 7) against the merchant-of-record
 *    arrangement with Stripe / Paystack / Flutterwave. Each PSP has its
 *    own chargeback fee and process.
 * 4. The ticket-voiding mechanism (sec. 3) is implemented in code: when
 *    an order moves to REFUNDED, its tickets move to VOID and the
 *    check-in scanner refuses them. Any change in product behavior here
 *    must be reflected in this section.
 */
export default function RefundsPage() {
  return (
    <>
      <h1>Refund Policy</h1>
      <p className="text-xs uppercase tracking-wider text-ink-muted">
        Last updated: {LAST_UPDATED}
      </p>

      <p>
        This policy explains how refunds work on Orkora. It is the public
        Orkora policy; each Organizer publishes their own event-level refund
        terms on the event page, and you accept those terms when you complete
        checkout.
      </p>

      <h2>1. Orkora&apos;s role</h2>
      <p>
        Orkora is a platform: the contract for any event ticket you buy is
        between you and the <strong>Organizer</strong> of that event, not
        Orkora. The Organizer sets the refund terms for their own event and
        is the party who decides whether a refund is granted.
      </p>
      <p>
        Our job is to faithfully execute the Organizer&apos;s decision through
        the payment provider that originally processed your payment (Stripe,
        Paystack, or Flutterwave), to send you a refund confirmation email
        once the refund settles, and to void the ticket QR codes for the
        refunded order so they no longer admit at check-in.
      </p>

      <h2>2. Where to find the event&apos;s refund terms</h2>
      <p>
        Each event listing shows the Organizer&apos;s own refund terms before
        you complete checkout. By buying a ticket you accept those terms. If
        the listing did not include refund terms, contact the Organizer first
        through the &quot;Contact organizer&quot; link on the event page.
      </p>

      <h2>3. How a refund is processed</h2>
      <p>
        When the Organizer approves your refund from their dashboard, Orkora
        executes it in three coordinated steps so the result is correct even
        if a payment-provider event is delayed or missed:
      </p>
      <ul>
        <li>
          We call the payment provider to initiate the refund and capture the
          synchronous result. Most card refunds settle immediately at this
          step.
        </li>
        <li>
          The payment provider also sends us an asynchronous webhook when
          the refund settles in their system. Both paths are idempotent: only
          the first one to win flips your order to <strong>refunded</strong>;
          the others are no-ops.
        </li>
        <li>
          A reconciliation sweep runs on a schedule and re-checks any refund
          that was started but did not settle synchronously, so a missed
          webhook never strands the order in the wrong state.
        </li>
      </ul>
      <p>
        Once the refund is settled, three things happen in the same
        transaction:
      </p>
      <ul>
        <li>your order is marked <strong>refunded</strong> in Orkora;</li>
        <li>the ticket QR codes for that order are <strong>voided</strong>, so they cannot admit you at the event;</li>
        <li>you receive a <strong>refund confirmation email</strong>, sent at most once per order (an idempotency log prevents duplicate sends).</li>
      </ul>

      <h2>4. How long the money takes to arrive</h2>
      <p>
        On the Orkora side, your order is marked refunded immediately when
        the provider confirms. On <strong>your bank&apos;s side</strong>, the
        money typically arrives in <strong>5 to 10 business days</strong> for
        a card refund, depending on your bank and country. Bank-to-bank
        refunds (used by some Paystack and Flutterwave methods) can take
        longer; the provider&apos;s own published timing applies.
      </p>
      <p>
        If your order still shows <strong>paid</strong> in your tickets page
        more than 24 hours after the Organizer told you the refund was
        approved, click the &quot;Re-check refund&quot; button on the
        Organizer&apos;s dashboard (if you are the Organizer) or contact{' '}
        <a href="mailto:support@orkora.io">support@orkora.io</a> with your
        order ID. We can run a manual reconciliation against the provider
        from the dashboard.
      </p>

      <h2>5. Partial refunds and quantity refunds</h2>
      <p>
        Orkora currently supports full-order refunds. Partial refunds (a
        single ticket out of a multi-ticket order) are not supported at this
        time. If the Organizer wants to refund some but not all attendees on
        the same order, the Organizer should refund the full order and have
        the remaining attendees re-register. We will tell you on this page
        when partial refunds ship.
      </p>

      <h2>6. Platform fees on refund</h2>
      <p>
        <strong>
          [PLATFORM FEE REFUND TREATMENT, default for the current beta period:
          Orkora does not charge a platform fee on paid tickets, so there is
          no Orkora platform fee to refund or retain.]
        </strong>
      </p>
      <p>
        Payment-provider processing fees (Stripe, Paystack, Flutterwave) are
        treated according to the provider&apos;s own published policy. In
        most cases the original transaction fee is not returned to the
        Organizer when the ticket is refunded; this is the provider&apos;s
        cost, not Orkora&apos;s.
      </p>

      <h2>7. Cancellations by the Organizer</h2>
      <p>
        If an Organizer cancels an event after tickets have been sold, the
        Organizer is responsible for refunding ticket holders according to
        the terms they published. We will contact the Organizer on your
        behalf if you raise an issue, but the underlying refund decision
        rests with them.
      </p>

      <h2>8. Disputes and chargebacks</h2>
      <p>
        Please contact the Organizer first, then{' '}
        <a href="mailto:support@orkora.io">support@orkora.io</a>, before
        opening a chargeback with your card issuer. Chargebacks freeze the
        funds for several weeks, incur a fee for the Organizer that often
        exceeds the original ticket price, and can result in the
        Organizer&apos;s payment account being suspended. We can almost
        always resolve a legitimate refund faster than the bank can.
      </p>

      <h2>9. Fraudulent or unauthorised transactions</h2>
      <p>
        If you do not recognise a charge from an Orkora Organizer on your
        statement, contact{' '}
        <a href="mailto:support@orkora.io">support@orkora.io</a> immediately
        with the date, amount, and currency of the charge. We will trace it
        to the underlying order, contact the Organizer, and either refund
        the charge or provide you with the Organizer&apos;s contact details
        for further dispute.
      </p>

      <h2>10. Contact</h2>
      <p>
        Refund questions where the Organizer is unreachable or unresponsive:{' '}
        <a href="mailto:support@orkora.io">support@orkora.io</a>. Include the
        event name, your order ID (printed on every Orkora receipt), and the
        date of purchase.
      </p>
    </>
  );
}
