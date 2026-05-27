export const metadata = { title: 'Refund Policy - Orkora' };

const LAST_UPDATED = '25 May 2026';

export default function RefundsPage() {
  return (
    <>
      <h1>Refund Policy</h1>
      <p className="text-xs uppercase tracking-wider text-ink-muted">
        Last updated: {LAST_UPDATED}
      </p>

      <h2>1. How refunds work on Orkora</h2>
      <p>
        Orkora is a platform: the contract for any event ticket you buy is
        between you and the <strong>Organizer</strong> of that event, not
        Orkora. The Organizer sets the refund policy for their own event and
        is the party who decides whether a refund is granted. Orkora&#39;s job
        is to faithfully execute that decision through the payment provider
        and to keep your local ticket status in sync with the result.
      </p>

      <h2>2. Where to find the event&#39;s policy</h2>
      <p>
        Each event listing shows the Organizer&#39;s own refund terms before
        you complete checkout. By buying the ticket you accept those terms.
        If the event listing did not include refund terms, contact the
        Organizer first using the &quot;Contact organizer&quot; link on the
        event page.
      </p>

      <h2>3. Standard processing</h2>
      <p>
        When an Organizer approves a refund, Orkora initiates it with the
        payment service provider (Stripe, Paystack, or Flutterwave) that
        originally took the payment. Most card refunds settle within seconds on
        the provider side; the money typically arrives back on the original
        method in <strong>5-10 business days</strong>, depending on your bank.
        For bank-backed methods, settlement can take longer.
      </p>
      <p>
        Once the refund is settled, your order on Orkora is marked{' '}
        <strong>refunded</strong> automatically. If the order still shows as
        paid more than 24 hours after the Organizer confirmed the refund,
        contact <a href="mailto:support@orkora.io">support@orkora.io</a> with
        your order ID and we will reconcile it.
      </p>

      <h2>4. Cancellations by the Organizer</h2>
      <p>
        If an Organizer cancels an event after tickets have been sold, the
        Organizer is responsible for refunding ticket holders according to the
        terms they published. We will reach out to the Organizer on your
        behalf if you raise an issue, but the underlying refund decision rests
        with them.
      </p>

      <h2>5. Disputes and chargebacks</h2>
      <p>
        Please contact the Organizer first, then{' '}
        <a href="mailto:support@orkora.io">support@orkora.io</a>, before opening
        a chargeback with your card issuer. Chargebacks freeze the funds for
        weeks and incur fees for the Organizer that often exceed the original
        ticket price; we can usually resolve a legitimate refund faster than
        the bank can.
      </p>

      <h2>6. Platform fees</h2>
      <p>
        <strong>[FILL IN once platform fee is set]</strong>. If Orkora charges
        a platform fee on a ticket and the ticket is fully refunded, the
        platform fee is{' '}
        <strong>[FILL IN: refunded / retained as a service fee]</strong>.
      </p>

      <h2>7. Contact</h2>
      <p>
        Refund questions where the Organizer is unreachable or unresponsive:{' '}
        <a href="mailto:support@orkora.io">support@orkora.io</a>. Include the
        event name, your order ID, and the date of purchase.
      </p>
    </>
  );
}
