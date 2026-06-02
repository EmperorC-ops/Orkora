export const metadata = { title: 'Terms of Service - Orkora' };

const LAST_UPDATED = '2 June 2026';

/**
 * COUNSEL REVIEW CHECKLIST (delete this comment before public launch)
 * ------------------------------------------------------------------
 * 1. Replace every [BRACKETED VALUE] with the company-specific value.
 *    Defaults are suggestions; counsel may rewrite freely.
 * 2. Confirm jurisdiction + venue clause (sec. 14) matches the entity
 *    of record.
 * 3. Confirm liability cap (sec. 12) is consistent with insurance.
 * 4. Confirm export-controls clause (sec. 7) reflects current sanctions
 *    posture (default lists US OFAC, UN, EU consolidated lists).
 * 5. Confirm beta-service caveat (sec. 4) survives a transition to GA;
 *    we will remove it from the published doc once GA pricing is set.
 * 6. Refund Policy + Organizer Agreement are companion docs; they
 *    cross-reference. Material changes here may need parallel edits
 *    there.
 * 7. Email addresses (hello@, security@, privacy@, support@,
 *    abuse@) all need to resolve to a real inbox before launch.
 */
export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="text-xs uppercase tracking-wider text-ink-muted">
        Last updated: {LAST_UPDATED}
      </p>

      <p>
        These Terms of Service (&quot;Terms&quot;) are a contract between you
        and{' '}
        <strong>
          [LEGAL ENTITY NAME, e.g. Orkora Technologies Ltd, RC [number],
          registered at [address]]
        </strong>{' '}
        (&quot;Orkora&quot;, &quot;we&quot;, &quot;us&quot;). They cover your
        use of orkora.events, our mobile app, and our APIs (together, the
        &quot;Service&quot;). By creating an account or otherwise using the
        Service, you agree to these Terms. If you do not agree, do not use
        Orkora.
      </p>

      <h2>1. Who can use Orkora</h2>
      <p>
        You must be at least 18 years old (or the age of majority in your
        jurisdiction, whichever is higher) to use the Service. If you use
        Orkora on behalf of an organization, you confirm that you are
        authorised to bind that organization to these Terms and to the{' '}
        <a href="/legal/organizer">Organizer Agreement</a>.
      </p>
      <p>
        We do not offer the Service to people or entities in jurisdictions
        subject to comprehensive sanctions by the United Nations, the European
        Union, or the United States Office of Foreign Assets Control (OFAC).
        You confirm you are not on any government sanctions, terror, or
        denied-parties list.
      </p>

      <h2>2. What Orkora does</h2>
      <p>
        Orkora is a platform that helps <strong>Organizers</strong> publish
        events, sell tickets, run live engagement (chat, questions, polls),
        check attendees in, issue refunds, and report on outcomes. We connect
        Organizers and Attendees; we are not the organizer of any event listed
        on the platform, we do not host events ourselves, and we are not a
        party to the contract between an Organizer and an Attendee.
      </p>

      <h2>3. Your account</h2>
      <p>
        You are responsible for keeping your sign-in credentials confidential
        and for any activity on your account. The Service enforces multiple
        protections against unauthorised access (passwords are hashed using
        argon2, refresh tokens are rotated on every use with reuse-detection
        that revokes the whole family, and the login endpoint has per-account
        exponential back-off on failed attempts), but none of these substitute
        for password hygiene at your end. Tell us at{' '}
        <a href="mailto:security@orkora.events">security@orkora.events</a> as soon as
        you suspect any unauthorised access.
      </p>

      <h2>4. Beta service</h2>
      <p>
        Orkora is currently in <strong>private beta</strong>. During this
        period:
      </p>
      <ul>
        <li>
          features may change, be added, or be removed without prior notice;
        </li>
        <li>
          the Service is provided without a Service Level Agreement, although
          we monitor uptime and respond to outages in good faith;
        </li>
        <li>
          we do not charge a platform fee on paid tickets. Provider fees
          (Stripe, Paystack, Flutterwave) still apply at the published rates of
          the payment provider you use;
        </li>
        <li>
          we will give beta Organizers at least 60 days&apos; written notice
          before introducing any per-ticket fee, with a 30-day grace period for
          events already published at that time.
        </li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use Orkora for any unlawful activity, including fraud, money laundering, or the distribution of illegal content;</li>
        <li>list events that promote violence, hatred, discrimination, terrorism, sexual exploitation, or harm to minors;</li>
        <li>send unsolicited bulk messages through Orkora&apos;s communication features;</li>
        <li>interfere with the integrity or security of the Service, including bypassing rate limits, reverse-engineering the API, scraping data you are not authorised to see, or testing for vulnerabilities outside our published responsible-disclosure programme (see section 13);</li>
        <li>impersonate any person or organization, or misrepresent your affiliation;</li>
        <li>use the Service to compete with Orkora by building a substantially similar service from the data you observe through it.</li>
      </ul>

      <h2>6. Your content</h2>
      <p>
        You retain ownership of the content you upload to Orkora (event
        descriptions, banner images, attendee data you collect, messages you
        post). You grant Orkora a non-exclusive, worldwide, royalty-free
        licence to host, display, store, back up, and process that content as
        necessary to operate the Service for you. You represent that you have
        the rights to upload the content 