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
        orkora.io and via our mobile app and APIs (the &quot;Service&quot;).
        We have written it to be readable. If a clause is unclear, write to{' '}
        <a href="mailto:privacy@orkora.io">privacy@orkora.io</a> and we will
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
          for global acquiring): card payments and refunds. PCI DSS Level 1.
          Receives full card data on its hosted checkout; we only receive
          tokens.
        </li>
        <li>
          <strong>Paystack</strong> (Nigeria): card and bank payments,
          primarily for NGN settlement. PCI DSS Level 1.
        </li>
        <li>
          <strong>Flutterwave</strong> (Nigeria): card and bank payments,
          primarily for cross-border African settlement. PCI DSS Level 1.
        </li>
        <li>
          <strong>UptimeRobot</strong> (United States): external uptime
          monitoring against our public liveness and readiness endpoints. No
          personal data.
        </li>
      </ul>
      <p>
        We publish material changes to this list (new sub-processor, replaced
        sub-processor) at least 30 days before they take effect. You can
        subscribe to those updates by emailing{' '}
        <a href="mailto:privacy@orkora.io">privacy@orkora.io</a>.
      </p>

      <h2>5. Who else sees your data</h2>
      <ul>
        <li>
          <strong>Organizers</strong> see the data of attendees on their own
          events (name, email, phone if provided, ticket type, check-in
          status, order total, masked card brand). Row-level security in the
          database enforces this so an Organizer cannot see data from another
          Organizer&apos;s event.
        </li>
        <li>
          <strong>Other Attendees</strong> see your name and your messages in
          live chat and questions, only for events you have registered to and
          only for the duration of the event live window.
        </li>
        <li>
          <strong>Public authorities</strong>, when compelled by valid legal
          process or to prevent imminent harm. We log every such request and,
          where the law allows, notify the affected user.
        </li>
      </ul>

      <h2>6. International transfers</h2>
      <p>
        Our hosting and email infrastructure is located in{' '}
        <strong>
          [REGIONS, default: Frankfurt (EU) and the United States]
        </strong>
        . Where personal data of residents of Nigeria, the EU, or the UK is
        transferred to a country without an adequacy decision, we rely on
        standard contractual clauses with our sub-processors and on
        transfer-impact assessments that reflect the destination
        country&apos;s surveillance regime.
      </p>

      <h2>7. How long we keep it</h2>
      <p>
        We keep personal data only as long as we need it for the purposes
        above. Concretely:
      </p>
      <ul>
        <li>
          <strong>Account data</strong> (your login, profile, organization
          membership): while your account is active, plus 30 days after
          closure to allow reactivation.
        </li>
        <li>
          <strong>Financial records</strong> (orders, payments, refunds,
          payouts): <strong>[RETENTION, default: 6 years]</strong> after the
          transaction date, to satisfy tax and accounting obligations.
        </li>
        <li>
          <strong>Event attendance data</strong> on behalf of an Organizer
          (registrations, tickets, check-ins, chat messages): controlled by
          the Organizer and deleted when the Organizer requests deletion or
          closes their account, subject to the financial-records retention
          above.
        </li>
        <li>
          <strong>Audit-log entries</strong> for sensitive actions: 24 months.
        </li>
        <li>
          <strong>Server request logs</strong>: 30 days.
        </li>
        <li>
          <strong>Error reports in Sentry</strong>: 90 days.
        </li>
        <li>
          <strong>Email-OTP codes</strong>: 10 minutes (per the codebase
          expiry, after which the row is purged on next use of the table).
        </li>
        <li>
          <strong>Refresh tokens</strong>: rotated on every use; revoked
          tokens are kept for 30 days for forensic and reuse-detection
          purposes, then purged.
        </li>
      </ul>

      <h2>8. Your rights</h2>
      <p>
        Under the Nigeria Data Protection Regulation (NDPR), the Nigeria Data
        Protection Act 2023, the EU General Data Protection Regulation
        (GDPR), and the UK GDPR (whichever applies to you), you have the
        right to:
      </p>
      <ul>
        <li>be informed about how we use your data (this policy);</li>
        <li>access the personal data we hold about you;</li>
        <li>have inaccurate or incomplete data corrected;</li>
        <li>have your data deleted, subject to retention duties we cannot waive (financial records, regulator investigations);</li>
        <li>restrict or object to specific processing activities;</li>
        <li>port your data to another provider in a structured, machine-readable format;</li>
        <li>withdraw consent at any time where consent is the lawful basis (withdrawal does not affect prior processing);</li>
        <li>not be subject to fully automated decisions that significantly affect you.</li>
      </ul>
      <p>
        To exercise any of these, write to{' '}
        <a href="mailto:privacy@orkora.io">privacy@orkora.io</a> from the
        email on file or include enough information for us to verify your
        identity. We respond within 30 days. If we cannot resolve your
        concern, you may complain to the Nigeria Data Protection Commission
        (NDPC, formerly NITDA), the UK Information Commissioner&apos;s Office
        (ICO), or your EU member-state supervisory authority, as applicable.
      </p>

      <h2>9. Cookies and local storage</h2>
      <p>
        Orkora uses the minimum browser storage needed to keep you signed in.
        We do not use third-party tracking cookies or advertising trackers.
      </p>
      <ul>
        <li>
          <code>orkora_refresh</code> &mdash; httpOnly, Secure,{' '}
          <code>SameSite=Lax</code> cookie scoped to <code>/v1/auth</code>,
          holding the refresh token used to rotate access tokens. Lifetime: 30
          days, rotated on every use.
        </li>
        <li>
          <code>orkora_access</code> in <code>sessionStorage</code> &mdash;
          short-lived access token used to call the API. Cleared on tab close.
        </li>
        <li>
          <code>orkora_pending_signup</code> in <code>sessionStorage</code>
          &mdash; the in-flight signup credentials between the form and the
          OTP verification step. Wiped on signup success or failure. Same
          tab, same session only.
        </li>
      </ul>

      <h2>10. Security</h2>
      <p>
        We treat security as a product feature. As of the last update:
        traffic is served over TLS; passwords are hashed with argon2;
        refresh tokens are SHA-256-peppered before storage and rotated on
        every use, with reuse-detection that revokes the whole token family
        on replay; the login endpoint applies per-account exponential
        back-off in addition to per-IP rate limiting; the database enforces
        row-level tenant isolation so an Organizer cannot read data from
        another Organizer&apos;s rows; all sensitive state transitions
        (payment settlement, refund settlement, role changes) are recorded
        in an audit log; payment and refund settlement uses idempotent
        verify-on-action plus a webhook plus a reconciliation sweep, so a
        missed event cannot strand a buyer in the wrong state. No system is
        perfectly secure; if you discover a vulnerability, report it under
        our responsible-disclosure policy at{' '}
        <a href="mailto:security@orkora.io">security@orkora.io</a>.
      </p>

      <h2>11. Children</h2>
      <p>
        Orkora is not directed at people under 18. We do not knowingly
        collect personal data from anyone under 18. If you are an Organizer
        running an event that admits minors, you remain responsible for
        collecting any required guardian consent. If you believe a minor has
        provided us data, contact{' '}
        <a href="mailto:privacy@orkora.io">privacy@orkora.io</a> and we will
        delete it.
      </p>

      <h2>12. Changes to this policy</h2>
      <p>
        We may update this policy as the Service evolves. Material changes
        will be notified by email and surfaced in the dashboard at least 14
        days before they take effect. The &quot;last updated&quot; date at
        the top of this page reflects the most recent revision.
      </p>

      <h2>13. Contact</h2>
      <p>
        Privacy questions and rights requests:{' '}
        <a href="mailto:privacy@orkora.io">privacy@orkora.io</a>.<br />
        Security:{' '}
        <a href="mailto:security@orkora.io">security@orkora.io</a>.<br />
        Data Protection Officer:{' '}
        <strong>
          [DPO NAME, EMAIL, default: dpo@orkora.io]
        </strong>
        .<br />
        EU representative (if applicable):{' '}
        <strong>[EU REP NAME, ADDRESS]</strong>.<br />
        Registered address: <strong>[REGISTERED ADDRESS]</strong>.
      </p>
    </>
  );
}
