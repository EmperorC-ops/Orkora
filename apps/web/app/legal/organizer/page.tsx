export const metadata = { title: 'Organizer Agreement - Orkora' };

const LAST_UPDATED = '25 May 2026';

export default function OrganizerAgreementPage() {
  return (
    <>
      <h1>Organizer Agreement</h1>
      <p className="text-xs uppercase tracking-wider text-ink-muted">
        Last updated: {LAST_UPDATED}
      </p>

      <p>
        This Organizer Agreement applies if you create an organization on
        Orkora to publish events, sell tickets, or manage attendees. It sits
        on top of the <a href="/legal/terms">Terms of Service</a> and the{' '}
        <a href="/legal/privacy">Privacy Policy</a>; where it overlaps with
        them, the more specific clause here wins.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least 18 and authorised to enter contracts on behalf of
        any organization you list yourself as representing. We may ask for
        verification of identity, business registration, or bank account
        ownership before enabling payments or before payouts above a
        threshold.
      </p>

      <h2>2. Your responsibilities as Organizer</h2>
      <ul>
        <li>The events you list are real, accurately described, and lawful in the venue and jurisdiction where they happen.</li>
        <li>You hold any permits, licences, and insurance the event requires; you are responsible for safety on the ground.</li>
        <li>You set ticket prices and a clear refund policy and you honour them. Your refund policy is shown to buyers at checkout.</li>
        <li>You communicate truthfully with attendees about schedule, venue, capacity, and changes.</li>
      </ul>

      <h2>3. Payments and payouts</h2>
      <p>
        Ticket payments are processed by the payment service provider you
        configure (Stripe, Paystack, or Flutterwave). Orkora does not hold
        funds on your behalf: the PSP settles directly to your connected bank
        account on its own schedule.
      </p>
      <p>
        Orkora may charge a platform fee per paid ticket, currently{' '}
        <strong>[FILL IN: platform fee % or &quot;no platform fee during private beta&quot;]</strong>.
        Provider fees (Stripe, Paystack, Flutterwave) are separate and apply
        on top.
      </p>

      <h2>4. Refunds initiated by you</h2>
      <p>
        You can refund any paid order from the attendee detail page. Orkora
        initiates the refund with the PSP and reflects the settled status on
        the order. Refunding a fully-paid order returns the funds to the
        attendee&#39;s original method. See the{' '}
        <a href="/legal/refunds">Refund Policy</a> for processing time and
        platform-fee treatment.
      </p>

      <h2>5. Content standards</h2>
      <p>You agree not to use Orkora to list or run events that:</p>
      <ul>
        <li>are fraudulent, deceptive, or impersonate a third party;</li>
        <li>promote violence, discrimination, or harm to minors;</li>
        <li>require attendees to commit illegal acts;</li>
        <li>sell tickets to a venue you do not have permission to use;</li>
        <li>involve restricted goods or activities without the necessary licences (e.g. alcohol, gambling, securities, healthcare).</li>
      </ul>
      <p>
        Orkora may take down listings that violate these standards and may
        suspend the underlying organization without refunding platform fees.
      </p>

      <h2>6. Data and privacy</h2>
      <p>
        When attendees register for your event, you become the{' '}
        <strong>data controller</strong> for their attendance data and Orkora
        is your <strong>processor</strong>. That means you:
      </p>
      <ul>
        <li>need a lawful basis under the NDPR (and any other applicable law) for collecting and using attendee data;</li>
        <li>must tell attendees what you will use their data for, in your own privacy notice if your use goes beyond running the event;</li>
        <li>must honour rights requests (access, deletion, etc.) that attendees raise with you;</li>
        <li>must not export attendee data to third parties without a lawful basis and the appropriate safeguards.</li>
      </ul>
      <p>
        Orkora processes that data only to operate the platform, as described
        in our <a href="/legal/privacy">Privacy Policy</a>, and helps you
        respond to attendee data requests through the dashboard.
      </p>

      <h2>7. Tax</h2>
      <p>
        You are responsible for collecting and remitting any taxes (VAT,
        withholding, income, etc.) that your events trigger in your
        jurisdiction. Orkora does not act as your tax agent.
      </p>

      <h2>8. Suspension and termination</h2>
      <p>
        We may suspend an organization that has unresolved disputes,
        unanswered chargebacks, or repeated content-standards breaches. You
        can leave at any time by archiving your events and contacting{' '}
        <a href="mailto:hello@orkora.io">hello@orkora.io</a> to close the
        organization. Pending refunds and payouts are completed before final
        closure.
      </p>

      <h2>9. Indemnity</h2>
      <p>
        You will defend and indemnify Orkora against third-party claims that
        arise from your event, your content, your handling of attendee data,
        or your breach of this Agreement.
      </p>

      <h2>10. Disputes</h2>
      <p>
        Disputes between you and Orkora are governed by the{' '}
        <a href="/legal/terms">Terms of Service</a>. Disputes between you and
        an attendee should be resolved directly; you can escalate to{' '}
        <a href="mailto:support@orkora.io">support@orkora.io</a> if mediation
        is needed.
      </p>

      <h2>11. Contact</h2>
      <p>
        Organizer support:{' '}
        <a href="mailto:hello@orkora.io">hello@orkora.io</a>.
      </p>
    </>
  );
}
