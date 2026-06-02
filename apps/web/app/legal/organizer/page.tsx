export const metadata = { title: 'Organizer Agreement - Orkora' };

const LAST_UPDATED = '2 June 2026';

/**
 * COUNSEL REVIEW CHECKLIST (delete this comment before public launch)
 * ------------------------------------------------------------------
 * 1. Replace every [BRACKETED VALUE].
 * 2. Sec. 1 (Eligibility) sets KYC trigger at "before payouts above a
 *    threshold". The payment provider also runs KYC at onboarding; this
 *    sets the Orkora-side threshold for extra verification. Default is
 *    NGN 5,000,000 / US$5,000 settled in a 30-day window.
 * 3. Sec. 3 (Payments and payouts) clarifies that Orkora never holds
 *    funds. Confirm this matches the merchant-of-record arrangement
 *    with each PSP (Stripe Connect Standard / Paystack Sub-Accounts /
 *    Flutterwave Sub-Merchants).
 * 4. Sec. 5 (Content standards) and sec. 6 (Abuse takedown SLA) are
 *    the basis for our Trust & Safety operations. The SLA is a public
 *    commitment; align with the actual ops capacity.
 * 5. Sec. 7 (Data and privacy: Organizer as Controller) is a
 *    controller-processor declaration; ensure it is consistent with
 *    our DPA template, which is referenced but kept separate.
 * 6. Sec. 11 (Marketing comms to attendees) sets the bar for
 *    Organizer use of attendee data for marketing. Tighten if our
 *    market position changes.
 */
export default function OrganizerAgreementPage() {
  return (
    <>
      <h1>Organizer Agreement</h1>
      <p className="text-xs uppercase tracking-wider text-ink-muted">
        Last updated: {LAST_UPDATED}
      </p>

      <p>
        This Organizer Agreement applies if you create an organization on
        Orkora to publish events, sell tickets, or manage attendees. It
        supplements the <a href="/legal/terms">Terms of Service</a> and the{' '}
        <a href="/legal/privacy">Privacy Policy</a>; where it overlaps, the
        more specific clause here wins.
      </p>

      <h2>1. Eligibility and verification</h2>
      <p>
        You must be at least 18 years old and authorised to enter contracts
        on behalf of any organization you list yourself as representing. The
        payment provider you connect (Stripe, Paystack, or Flutterwave) runs
        its own Know-Your-Customer checks at onboarding; you must complete
        and maintain that verification.
      </p>
      <p>
        Orkora may ask for additional verification (proof of identity,
        business registration, bank-account ownership, or the source of an
        unusual order pattern) before enabling payments for you, before
        approving payouts above{' '}
        <strong>
          [KYC THRESHOLD, default: the equivalent of US$5,000 settled in a
          rolling 30-day window]
        </strong>
        , or whenever risk signals warrant it. We will tell you what we need
        and why, and we will not retain documents longer than necessary.
      </p>

      <h2>2. Your responsibilities as Organizer</h2>
      <ul>
        <li>The events you list are real, accurately described, and lawful in the venue and the jurisdiction where they happen.</li>
        <li>You hold any permits, licences, and insurance the event requires; you are responsible for safety on the ground.</li>
        <li>You set ticket prices and a clear refund policy and you honour them. Your refund policy is shown to buyers at checkout and is binding on you.</li>
        <li>You communicate truthfully with attendees about schedule, venue, capacity, sponsorship, and changes.</li>
        <li>You configure your tax treatment correctly (see section 9) and you are responsible for issuing any invoices required in your jurisdiction.</li>
      </ul>

      <h2>3. Payments and payouts</h2>
      <p>
        Ticket payments are processed by the payment service provider you
        configure (Stripe, Paystack, or Flutterwave). Orkora does{' '}
        <strong>not</strong> hold funds on your behalf at any point: the
        provider settles directly to your connected bank account on its own
        schedule, which is governed by your contract with that provider.
      </p>
      <p>
        Orkora&apos;s platform fee is{' '}
        <strong>
          [PLATFORM FEE, default: &quot;no platform fee during private
          beta&quot;]
        </strong>
        . Provider fees (Stripe, Paystack, Flutterwave) are separate and apply
        at the provider&apos;s published rate. Orkora does not mark up
        provider fees. If we introduce or change the Orkora platform fee, we
        will give you at least 60 days&apos; written notice and a 30-day
        grace period for events already published at that time.
      </p>

      <h2>4. Refunds initiated by you</h2>
      <p>
        You can refund any paid order from the attendee detail page in your
        dashboard. Orkora calls the payment provider, marks the order
        <strong>refunded</strong> when the provider confirms, voids the
        ticket QR codes for that order so they no longer admit at check-in,
        and emails the buyer a refund confirmation. See the{' '}
        <a href="/legal/refunds">Refund Policy</a> for processing time and
        the platform-fee treatment.
      </p>
      <p>
        You are responsible for honouring your published refund policy. A
        pattern of refund refusals that breach your published policy may
        trigger suspension under section 6.
      </p>

      <h2>5. Content standards</h2>
      <p>
        You agree not to use Orkora to list or run events that:
      </p>
      <ul>
        <li>are fraudulent, deceptive, or impersonate a third party;</li>
        <li>promote violence, terrorism, hate, discrimination, sexual exploitation, or harm to minors;</li>
        <li>require attendees to commit illegal acts;</li>
        <li>sell access to a venue you do not have permission to use;</li>
        <li>involve restricted goods or activities without the necessary licences (alcohol, firearms, gambling, regulated financial products, healthcare services, prescription medication);</li>
        <li>infringe a third party&apos;s intellectual property, including unlicensed broadcasts or covers of copyrighted performances.</li>
      </ul>

      <h2>6. Abuse takedown and suspension</h2>
      <p>
        We take credible reports of abuse seriously. Our public service-level
        commitment is to acknowledge a report at{' '}
        <a href="mailto:abuse@orkora.io">abuse@orkora.io</a> within{' '}
        <strong>1 business day</strong>, complete an initial review within
        <strong>3 business days</strong>, and, where the report is verified,
        take down the listing or suspend the organization within the same
        review window.
      </p>
      <p>
        For repeat or egregious breaches, we may suspend the organization
        without prior notice. Suspended organizations cannot publish new
        events, accept new registrations, or take new payments; pending
        refunds and payouts are completed before any final closure.
      </p>

      <h2>7. Data and privacy: you are the Controller</h2>
      <p>
        When attendees register for your event, you become the{' '}
        <strong>data controller</strong> for their attendance data and Orkora
        is your <strong>processor</strong>. That means you:
      </p>
      <ul>
        <li>need a lawful basis under the Nigeria Data Protection Regulation (NDPR), the Nigeria Data Protection Act 2023, the GDPR, and any other applicable law for collecting and using attendee data;</li>
        <li>must tell attendees what you will use their data for in your own privacy notice, if your use goes beyond running the event;</li>
        <li>must honour rights requests (access, deletion, portability, objection) that attendees raise with you;</li>
        <li>must not export attendee data to third parties without a lawful basis and the appropriate safeguards.</li>
      </ul>
      <p>
        Orkora processes that data only to operate the Service, as described
        in our <a href="/legal/privacy">Privacy Policy</a>, and only on your
        documented instructions. The{' '}
        <strong>[ORKORA DATA PROCESSING AGREEMENT, link or attached as Exhibit A]</strong>{' '}
        sets out the technical and organisational measures, the sub-processor
        list, and the data-breach notification process. We will give you 30
        days&apos; notice of any new sub-processor.
      </p>

      <h2>8. Data export and migration out</h2>
      <p>
        You can export your event data at any time from the dashboard
        (attendees, registrations, orders, refunds, check-ins) as CSV. We
        treat data export as a feature, not a churn risk. On closure of
        your organization, you may export everything; we will retain only
        the financial records required by section 7 of the Privacy Policy.
      </p>

      <h2>9. Tax</h2>
      <p>
        You are responsible for collecting, accounting for, and remitting any
        taxes that your events trigger in your jurisdiction (Value Added
        Tax, Goods and Services Tax, withholding tax, income tax). Orkora
        does not act as your tax agent and does not deduct tax from your
        settlements. We will provide the transaction-level data your
        accountant needs.
      </p>

      <h2>10. Chargebacks and disputes</h2>
      <p>
        When an attendee opens a chargeback with their card issuer, the
        payment provider freezes the disputed amount in your account until
        the dispute is resolved. We will pass the provider&apos;s notice on
        to you with the attendee&apos;s claim and any evidence the issuer
        needs. The provider&apos;s own chargeback fee applies to you
        regardless of outcome.
      </p>
      <p>
        Orkora may suspend an organization with an unusually high chargeback
        rate (typically above 1% of net transactions over a rolling 30-day
        window) until the rate is brought back into normal range.
      </p>

      <h2>11. Marketing communications to your attendees</h2>
      <p>
        Attendee contact details (email, phone) collected through Orkora may
        be used by you to:
      </p>
      <ul>
        <li>send transactional messages about the event the attendee registered for (reminders, agenda changes, post-event recap);</li>
        <li>send marketing about your future events <strong>only if</strong> you have collected the attendee&apos;s consent at registration, or if applicable law permits a soft opt-in. Every marketing email must include a clear unsubscribe link, and you must honour unsubscribe requests promptly.</li>
      </ul>
      <p>
        You may not transfer attendee contact details to a third party for
        marketing without the attendee&apos;s consent. Bulk export for the
        purpose of import into another marketing tool is allowed, but the
        rules above continue to apply to that tool.
      </p>

      <h2>12. Public API and integrations</h2>
      <p>
        If you build an integration using our public API, you must follow
        our published rate limits, keep your API keys confidential, and
        rotate them promptly if compromised. You are responsible for any
        third-party tool you connect to your Orkora data. We may rate-limit,
        throttle, or revoke any key that creates an outsized load or appears
        to be used outside its intended scope.
      </p>

      <h2>13. Suspension and termination</h2>
      <p>
        We may suspend an organization that has unresolved disputes,
        unanswered chargebacks, repeated content-standards breaches, or
        sustained chargeback rates above the threshold in section 10. You
        can leave at any time by archiving your events and contacting{' '}
        <a href="mailto:hello@orkora.io">hello@orkora.io</a> to close the
        organization. Pending refunds and payouts are completed before
        final closure. Your data is retained per the schedule in section 7
        of the Privacy Policy.
      </p>

      <h2>14. Indemnity</h2>
      <p>
        You will defend and indemnify Orkora, its officers, employees, and
        affiliates against any third-party claim, loss, or expense
        (including reasonable legal fees) that arises from: (a) your event;
        (b) your content; (c) your handling of attendee data; or (d) your
        breach of this Agreement or applicable law.
      </p>

      <h2>15. Disputes</h2>
      <p>
        Disputes between you and Orkora are governed by section 14 of the{' '}
        <a href="/legal/terms">Terms of Service</a>. Disputes between you and
        an attendee should be resolved directly; you can escalate to{' '}
        <a href="mailto:support@orkora.io">support@orkora.io</a> if
        mediation is needed.
      </p>

      <h2>16. Contact</h2>
      <p>
        Organizer support:{' '}
        <a href="mailto:hello@orkora.io">hello@orkora.io</a>.<br />
        Abuse reports:{' '}
        <a href="mailto:abuse@orkora.io">abuse@orkora.io</a>.<br />
        Trust and safety escalations:{' '}
        <a href="mailto:hello@orkora.io">hello@orkora.io</a> with subject
        line &quot;Trust &amp; Safety&quot;.<br />
        Security incidents:{' '}
        <a href="mailto:security@orkora.io">security@orkora.io</a>.
      </p>
    </>
  );
}
