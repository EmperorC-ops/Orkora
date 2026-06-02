export const metadata = { title: 'Privacy Policy - Orkora' };

const LAST_UPDATED = '2 June 2026';

/**
 * COUNSEL REVIEW CHECKLIST (delete this comment before public launch)
 * ------------------------------------------------------------------
 * 1. Replace every [BRACKETED VALUE]. Defaults assume Nigerian entity
 *    primarily processing personal data of African (NDPR) and EU
 *    (GDPR) residents.
 * 2. Confirm the sub-processor table (sec. 4) matches our current
 *    contracts. Add/remove rows whenever we change a provider. The
 *    table is the single source of truth for the DPIA.
 * 3. Confirm the data retention schedule (sec. 7) is consistent with
 *    Nigerian tax law (CITA s.55: 6 years for financial records) and
 *    NDPR principles (no longer than necessary).
 * 4. Confirm the DPO appointment (sec. 13). NDPR requires a DPO for
 *    controllers handling personal data of more than 1,000 data
 *    subjects in 6 months; we are above that threshold.
 * 5. Confirm the lawful basis for the email-OTP login flow (sec. 3):
 *    we rely on contract necessity, not consent.
 * 6. Cookies section (sec. 9) tracks the actual code. If we change the
 *    refresh-token storage strategy or add analytics, update this list.
 * 7. Email aliases (privacy@, security@, dpo@) need to resolve before
 *    launch.
 */
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-xs uppercase tracking-wider text-ink-muted">
        Last updated: {LAST_UPDATED}
      </p>

      <p>
        This policy explains how{' '}
        <strong>
          [LEGAL ENTITY NAME, e.g. Orkora Technologies Ltd, RC [number]]
        </strong>{' '}
        (&quot;Orkora&quot;, &quot;we&quot;) collects, uses, shares, and
        protects personal data when you use our event-management platform at
        orkora.events and via our mobile app and APIs (the &quot;Service&quot;).
        We have written it to be readable. If a clause is unclear, write to{' '}
        <a href="mailto:privacy@orkora.events">privacy@orkora.events</a> and we will
        rewrite it.
      </p>

      <h2>1. Who is the controller</h2>
      <p>
        For your <strong>Orkora account</strong> (your login, your
        organization membership, your billing details), Orkora is the data
        controller.
      </p>
      <p>
        For data about <strong>attendees of events</strong> created by an
        Organizer on Orkora, the Organizer is the controller of that
        attendance data and Orkora is the processor acting on the
        Organizer&apos;s instructions. The Organizer&apos;s own privacy notice
        applies to any use beyond running the event.
      </p>

      <h2>2. What we collect</h2>
      <p>We collect personal data in three ways:</p>
      <ul>
        <li>
          <strong>You give it to us</strong>: full name, email address, phone
          number (optional), password (stored only as an argon2 hash, never
          plaintext), profile photo (optional), the organization you belong
          to, payment-related identifiers issued by Stripe / Paystack /
          Flutterwave for tickets you buy, content you post in event chat or
          questions, refund and dispute correspondence.
        </li>
        <li>
          <strong>Generated automatically by your use of the Service</strong>:
          device and browser metadata (user agent, OS family), IP address,
          server request logs correlated by request ID, error reports
          captured by Sentry, audit-log entries for sensitive actions
          (refunds, role changes, account deletion, event publication),
          throttling counters for rate limits and the per-account login
          back-off, and the integrity-check timestamps that fuel our refund
          reconciliation sweep.
        </li>
        <li>
          <strong>From third parties</strong>: identity confirmation from
          Google or Apple if you sign in with those, the masked card brand and
          last four digits returned by Stripe / Paystack / Flutterwave for
          ticket payments. We never see or store full payment card numbers; the
          card is entered in the payment provider&apos;s hosted checkout, not
          on Orkora.
        </li>
      </ul>
      <p>
        We do not collect special-category data (health, biometrics, sexual
        orientation, religion, political views) unless an Organizer
        deliberately puts it in their registration form, in which case the
        Organizer must have a separate lawful basis and tell their attendees
        about it.
      </p>

      <h2>3. How we use it and our lawful basis</h2>
      <ul>
        <li>
          <strong>Run the Service</strong> (create your account, issue
          tickets, route check-in, run live engagement, settle payments and
          refunds, send transactional emails like sign-in codes, ticket
          confirmations, paid receipts, and refund confirmations). Lawful
          basis: performance of the contract you accepted in our Terms.
        </li>
        <li>
          <strong>Keep the Service safe</strong> (rate limits, per-account
          login back-off, refresh-token rotation with reuse detection, audit
          log, idempotent payment + refund settlement, abuse detection on
          chat). Lawful basis: our legitimate interest in operating a secure
          platform, balanced against your privacy.
        </li>
        <li>
          <strong>Improve the product</strong> (aggregated metrics, error
          monitoring through Sentry, technical-issue triage). Lawful basis:
          our legitimate interest, balanced against your privacy.
        </li>
        <li>
          <strong>Comply with the law</strong> (financial record-keeping,
          tax obligations, lawful requests from regulators or courts). Lawful
          basis: legal obligation.
        </li>
      </ul>
      <p>
        We do not use personal data for advertising and we do not sell it.
      </p>

      <h2>4. Sub-processors we rely on</h2>
      <p>
        The following sub-processors handle personal data on our behalf. Each
        is bound by a data-processing agreement that mirrors our obligations
        to you.
      </p>
      <ul>
        <li>
          <strong>Render</strong> (United States): application hosting for the
          API. Receives request bodies in transit; does not persist personal
          data.
        </li>
        <li>
          <strong>Vercel</strong> (United States): hosting for the web app.
          Receives request bodies and serves the marketing pages and the
          dashboard.
        </li>
        <li>
          <strong>Neon</strong> (
          <strong>[NEON REGION, default: Frankfurt, EU-Central-1]</strong>):
          managed PostgreSQL hosting. Persists all account, event,
          registration, ticket, order, audit-log, and refund data. Encryption
          at rest is on by default.
        </li>
        <li>
          <strong>Cloudflare R2</strong> (
          <strong>[R2 REGION, default: Western Europe]</strong>): object
          storage for event banner images and other uploads. Encryption at
          rest is on by default.
        </li>
        <li>
          <strong>Postmark</strong> (United States): transactional email
          delivery for sign-in codes, ticket confirmations, receipts, and
          refund notifications. Stores email addresses and message content
          for delivery; retention is set to 45 days.
        </li>
        <li>
          <strong>Sentry</strong> (
          <strong>[SENTRY REGION, default: EU]</strong>): error and performance
          monitoring. Receives stack traces, request IDs, and partial request
          metadata; we scrub user-provided fields before they reach Sentry.
          Retention is 90 days.
        </li>
        <li>
          <strong>Stripe</strong> (Ireland for EU acquiring, United States
          for global acquiring): card payments and refunds. PCI DSS Level