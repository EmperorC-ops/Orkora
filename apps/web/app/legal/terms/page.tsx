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
        use of orkora.io, our mobile app, and our APIs (together, the
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
        <a href="mailto:security@orkora.io">security@orkora.io</a> as soon as
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
        the rights to upload the content and that it does not violate any
        third party&apos;s intellectual property, privacy, or other rights.
      </p>

      <h2>7. Payments and fees</h2>
      <p>
        Ticket payments are processed by third-party payment service providers
        you connect (currently <strong>Stripe</strong>,{' '}
        <strong>Paystack</strong>, and <strong>Flutterwave</strong>). Orkora
        does not hold funds on your behalf at any point; the payment provider
        settles directly to the bank account you configure on its own
        schedule. Provider processing fees (typically 1.5% to 3.9% plus a flat
        per-transaction component, depending on the provider, currency, and
        card type) are paid out of your settlement at the provider&apos;s
        published rate.
      </p>
      <p>
        Orkora&apos;s platform fee is{' '}
        <strong>
          [PLATFORM FEE, default: &quot;no platform fee during private
          beta&quot;]
        </strong>
        . Any future Orkora fee will be announced in writing at least 60 days
        in advance, will only apply to paid tickets, and will leave free
        events free forever.
      </p>

      <h2>8. Refunds</h2>
      <p>
        Refunds are governed by our{' '}
        <a href="/legal/refunds">Refund Policy</a>. In short: each Organizer
        sets the refund terms for their own event and decides whether to
        approve a refund. Orkora&apos;s role is to faithfully execute that
        decision through the payment provider and to keep the local ticket and
        order state in sync. When a paid order is refunded, the associated
        ticket QR codes are automatically voided and no longer admit the
        holder at check-in.
      </p>

      <h2>9. Intellectual property</h2>
      <p>
        The Orkora name, logo, software, and design system are owned by{' '}
        <strong>[LEGAL ENTITY NAME]</strong>. Nothing in these Terms grants you
        a licence to use them other than to access the Service as a normal
        user. If you build integrations using our public APIs, the integration
        you write is yours; the API itself is ours.
      </p>

      <h2>10. Suspension and termination</h2>
      <p>You may close your account at any time:</p>
      <ul>
        <li>
          from <strong>Settings &gt; Account &gt; Close account</strong> in the
          dashboard; or
        </li>
        <li>
          by emailing <a href="mailto:hello@orkora.io">hello@orkora.io</a> from
          the address on file.
        </li>
      </ul>
      <p>
        Closure triggers the data-retention schedule in section 6 of our{' '}
        <a href="/legal/privacy">Privacy Policy</a>. Pending refunds and any
        in-flight payouts are completed before final closure.
      </p>
      <p>
        We may suspend or terminate access to all or part of the Service if
        you breach these Terms, if we are required to do so by law, if a
        payment provider terminates our ability to process payments on your
        behalf, or if we reasonably believe ongoing access creates a risk to
        the platform, its users, or third parties. Where the circumstances
        allow, we will give you notice and a chance to cure before terminating.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        The Service is provided <strong>&quot;as is&quot;</strong> and{' '}
        <strong>&quot;as available&quot;</strong>. We do not warrant that the
        Service will be uninterrupted, error-free, or free from security
        incidents. We do not endorse, vet, verify, or guarantee any event
        listed on the platform, any Organizer&apos;s representations, or any
        Attendee&apos;s identity. You use the Service at your own risk.
      </p>

      <h2>12. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by applicable law, neither Orkora nor
        its officers, employees, or affiliates are liable for any indirect,
        incidental, special, consequential, or punitive damages (including
        lost profits, lost revenue, lost data, or business interruption)
        arising out of or related to your use of the Service, even if we have
        been advised of the possibility.
      </p>
      <p>
        Our total aggregate liability for any claim arising out of or related
        to the Service is capped at the greater of: (a) the total platform
        fees you paid to Orkora in the twelve (12) months immediately
        preceding the event giving rise to the claim, or (b){' '}
        <strong>
          [LIABILITY CAP, default: the equivalent of US$1,000 in your local
          currency]
        </strong>
        . Nothing in these Terms limits liability that cannot be limited under
        applicable law (for example, fraud, gross negligence, or death and
        personal injury caused by negligence).
      </p>

      <h2>13. Security disclosure</h2>
      <p>
        If you believe you have found a security vulnerability in Orkora,
        please report it to{' '}
        <a href="mailto:security@orkora.io">security@orkora.io</a>. We commit
        to acknowledging your report within 3 business days, providing a
        status update within 14 days, and not pursuing legal action against
        researchers who: (a) report in good faith, (b) do not exfiltrate data
        beyond what is needed to demonstrate the issue, (c) do not degrade
        the Service for other users, and (d) give us a reasonable time to
        remediate before public disclosure.
      </p>

      <h2>14. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the{' '}
        <strong>
          [GOVERNING LAW, default: Federal Republic of Nigeria]
        </strong>
        , without regard to its conflict-of-laws rules.
      </p>
      <p>
        The parties will first try to resolve any dispute informally by
        contacting{' '}
        <a href="mailto:hello@orkora.io">hello@orkora.io</a>. If the dispute
        cannot be resolved within 30 days, it will be referred to the
        exclusive jurisdiction of the courts of{' '}
        <strong>[VENUE, default: Lagos, Nigeria]</strong>, except where
        applicable consumer protection law gives a consumer a non-waivable
        right to a different forum.
      </p>

      <h2>15. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be
        notified by email to the address on file and surfaced in the
        dashboard at least 14 days before they take effect. Continued use of
        the Service after the effective date constitutes acceptance of the
        updated Terms. If you do not accept a material change, you may close
        your account before the effective date with no further obligation.
      </p>

      <h2>16. Miscellaneous</h2>
      <p>
        These Terms, together with the Privacy Policy, the Refund Policy, and
        (if applicable) the Organizer Agreement, are the entire agreement
        between you and Orkora regarding the Service. If any clause is held
        unenforceable, the rest stays in force. Our failure to enforce a
        clause once is not a waiver of our right to enforce it later. You may
        not assign or transfer your rights under these Terms without our
        consent; we may assign ours to a successor in connection with a merger,
        acquisition, or sale of substantially all of our assets.
      </p>

      <h2>17. Contact</h2>
      <p>
        General questions:{' '}
        <a href="mailto:hello@orkora.io">hello@orkora.io</a>.<br />
        Security:{' '}
        <a href="mailto:security@orkora.io">security@orkora.io</a>.<br />
        Abuse:{' '}
        <a href="mailto:abuse@orkora.io">abuse@orkora.io</a>.<br />
        Privacy:{' '}
        <a href="mailto:privacy@orkora.io">privacy@orkora.io</a>.<br />
        Legal notices:{' '}
        <strong>
          [REGISTERED ADDRESS for service of legal notices]
        </strong>
        .
      </p>
    </>
  );
}
