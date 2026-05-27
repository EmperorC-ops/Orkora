export const metadata = { title: 'Privacy Policy - Orkora' };

const LAST_UPDATED = '25 May 2026';

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-xs uppercase tracking-wider text-ink-muted">
        Last updated: {LAST_UPDATED}
      </p>

      <h2>1. Who we are</h2>
      <p>
        This policy explains how{' '}
        <strong>[FILL IN: legal entity name, e.g. Orkora Technologies Ltd.]</strong>{' '}
        (&quot;Orkora&quot;) collects, uses, and protects personal data when
        you use our event management platform. For attendees of events created
        by an Organizer on Orkora, that Organizer is the controller of your
        attendance data and Orkora is a processor on their behalf; for your
        Orkora account itself, Orkora is the controller.
      </p>

      <h2>2. What we collect</h2>
      <p>We collect personal data in three ways.</p>
      <ul>
        <li>
          <strong>You give it to us</strong>: name, email, phone number,
          password (hashed with argon2), profile photo, the organization you
          belong to, payment-related identifiers for ticket purchases, content
          you post in event chat or Q&amp;A.
        </li>
        <li>
          <strong>Generated automatically by your use</strong>: device and
          browser metadata, IP address, request logs (correlated by request
          id), error reports captured by Sentry, audit-log entries for
          sensitive actions (refunds, role changes, deletions).
        </li>
        <li>
          <strong>From third parties</strong>: identity confirmation from
          Google or Apple if you sign in with those, the masked card brand and
          last four digits from Stripe / Paystack / Flutterwave for ticket
          payments. We never see or store full payment card numbers.
        </li>
      </ul>

      <h2>3. How we use it and our lawful basis</h2>
      <ul>
        <li>
          <strong>To provide the service</strong> (create your account, issue
          tickets, route check-in, run live engagement). Lawful basis:
          performance of the contract you accepted in our Terms.
        </li>
        <li>
          <strong>To process payments</strong> via Stripe, Paystack, and
          Flutterwave. Lawful basis: performance of the contract.
        </li>
        <li>
          <strong>To send transactional emails</strong> (sign-in codes, ticket
          confirmations, receipts, refunds). Lawful basis: performance of the
          contract.
        </li>
        <li>
          <strong>To keep the platform safe</strong> (audit log, rate limits,
          abuse detection, refund-reuse detection on refresh tokens). Lawful
          basis: our legitimate interests in operating a secure platform.
        </li>
        <li>
          <strong>To improve the product</strong> (aggregated metrics, error
          monitoring). Lawful basis: our legitimate interests, balanced against
          your right to privacy.
        </li>
        <li>
          <strong>To comply with the law</strong> (financial record keeping,
          legal requests). Lawful basis: legal obligation.
        </li>
      </ul>

      <h2>4. Who we share it with</h2>
      <ul>
        <li>
          <strong>Organizers</strong> see attendee data for their own events
          (name, email, ticket info) so they can run the event.
        </li>
        <li>
          <strong>Sub-processors we rely on</strong>: Render and Cloudflare R2
          (hosting and file storage), Neon (database, hosted in{' '}
          <strong>[FILL IN: region, e.g. EU-Central]</strong>), Postmark
          (transactional email), Sentry (error monitoring), Stripe / Paystack /
          Flutterwave (payments). Each is bound by their own DPA and processes
          data only for the purpose we engage them for.
        </li>
        <li>
          <strong>Authorities</strong>, when compelled by valid legal process
          or to prevent imminent harm.
        </li>
      </ul>
      <p>
        We do not sell personal data and we do not share it with advertisers.
      </p>

      <h2>5. International transfers</h2>
      <p>
        Our hosting and email infrastructure is currently in{' '}
        <strong>[FILL IN: regions, e.g. Frankfurt (EU) and the US]</strong>.
        Where personal data of Nigerian residents is transferred outside
        Nigeria, we rely on standard contractual safeguards with our
        sub-processors and on the recipient&#39;s adequacy posture under NDPR
        Section 2.11.
      </p>

      <h2>6. How long we keep it</h2>
      <p>
        Account data is kept while your account is active and for{' '}
        <strong>[FILL IN: e.g. 12 months]</strong> after closure to support
        accounting, tax, and dispute resolution. Audit-log entries and
        webhook-event records are kept for{' '}
        <strong>[FILL IN: e.g. 24 months]</strong>. Server logs are retained
        for at most 90 days. You can request earlier deletion (see Your
        Rights).
      </p>

      <h2>7. Your rights under the NDPR</h2>
      <p>
        Under the Nigeria Data Protection Regulation (NDPR) you have the right
        to:
      </p>
      <ul>
        <li>be informed about how we use your data (this policy);</li>
        <li>access the personal data we hold about you;</li>
        <li>have inaccurate data corrected;</li>
        <li>have your data deleted, subject to our legal retention duties;</li>
        <li>restrict or object to specific processing activities;</li>
        <li>port your data to another provider in a structured, machine-readable format;</li>
        <li>withdraw consent at any time where consent is the lawful basis (this does not affect prior processing);</li>
        <li>not be subject to fully automated decisions that significantly affect you.</li>
      </ul>
      <p>
        To exercise any of these, write to{' '}
        <a href="mailto:privacy@orkora.io">privacy@orkora.io</a>. We will
        respond within 30 days. If we cannot resolve your concern, you may
        lodge a complaint with the National Information Technology Development
        Agency (NITDA) or your local data protection authority.
      </p>

      <h2>8. Children</h2>
      <p>
        Orkora is not directed at children under 18. We do not knowingly
        collect personal data from anyone under 18. If you believe a minor has
        provided us data, contact{' '}
        <a href="mailto:privacy@orkora.io">privacy@orkora.io</a> and we will
        delete it.
      </p>

      <h2>9. Security</h2>
      <p>
        We use TLS in transit, argon2 for password hashing, peppered hashing
        for refresh tokens, row-level tenant isolation for organizer data, and
        an audit log for sensitive actions. We monitor 5xx errors in real time
        and have an external uptime monitor on a database-aware readiness
        endpoint. No system is perfectly secure, but we treat security failures
        as launch-blocking incidents.
      </p>

      <h2>10. Cookies</h2>
      <p>
        We use the minimum cookies needed to keep you signed in: an httpOnly,
        Secure refresh-token cookie scoped to <code>/v1/auth</code>, and an
        access-token in sessionStorage. We do not use third-party tracking
        cookies or advertising trackers.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update this policy as the service evolves. Material changes will
        be notified by email and surfaced in the dashboard. The
        &quot;last updated&quot; date at the top reflects the most recent
        revision.
      </p>

      <h2>12. Contact</h2>
      <p>
        Privacy questions or requests:{' '}
        <a href="mailto:privacy@orkora.io">privacy@orkora.io</a>.<br />
        Data Protection Officer (NDPR): <strong>[FILL IN: DPO name + email]</strong>.<br />
        Registered address: <strong>[FILL IN]</strong>.
      </p>
    </>
  );
}
