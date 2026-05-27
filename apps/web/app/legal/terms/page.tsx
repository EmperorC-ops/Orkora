export const metadata = { title: 'Terms of Service - Orkora' };

const LAST_UPDATED = '25 May 2026';

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="text-xs uppercase tracking-wider text-ink-muted">
        Last updated: {LAST_UPDATED}
      </p>

      <h2>1. Agreement</h2>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of Orkora,
        the event management platform operated by{' '}
        <strong>[FILL IN: legal entity name, e.g. Orkora Technologies Ltd.]</strong>{' '}
        (&quot;Orkora&quot;, &quot;we&quot;, &quot;us&quot;). By creating an
        account or otherwise using the service, you agree to these Terms. If you
        do not agree, do not use Orkora.
      </p>

      <h2>2. Who can use Orkora</h2>
      <p>
        You must be at least 18 years old (or the age of majority in your
        jurisdiction, if higher) to use Orkora. If you are using Orkora on
        behalf of an organization, you confirm that you are authorised to bind
        that organization to these Terms.
      </p>

      <h2>3. What Orkora does</h2>
      <p>
        Orkora is a platform that helps <strong>Organizers</strong> publish
        events, sell tickets, run live engagement (chat, Q&amp;A, polls), check
        attendees in, and report on outcomes. We connect Organizers and
        Attendees; we are not the organizer of any event listed on the platform
        and we are not a party to the contract between an Organizer and an
        Attendee.
      </p>

      <h2>4. Your account</h2>
      <p>
        You are responsible for keeping your account credentials confidential
        and for any activity under your account. Notify us at{' '}
        <a href="mailto:security@orkora.io">security@orkora.io</a> as soon as
        you suspect unauthorised access. We may suspend or terminate accounts
        that violate these Terms.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use Orkora for any unlawful activity, including fraud, money laundering, or distribution of illegal content;</li>
        <li>list events that promote violence, discrimination, or harm to minors;</li>
        <li>send unsolicited bulk communications through Orkora;</li>
        <li>attempt to interfere with the integrity or security of the platform, including bypassing rate limits, reverse-engineering the API, or accessing data you are not authorised to see;</li>
        <li>impersonate a person or organization, or misrepresent your affiliation.</li>
      </ul>

      <h2>6. Content</h2>
      <p>
        You retain ownership of the content you upload to Orkora (event
        descriptions, images, attendee data, messages). You grant Orkora a
        non-exclusive, worldwide licence to host, display, and process that
        content as needed to operate the service. You represent that you have
        the rights to upload the content and that it does not violate any third
        party&#39;s rights.
      </p>

      <h2>7. Payments and fees</h2>
      <p>
        Ticket payments are processed by third-party payment service providers
        (Stripe, Paystack, Flutterwave). Orkora may charge a platform fee on
        each paid ticket, currently{' '}
        <strong>[FILL IN: platform fee %, or &quot;no platform fee during private beta&quot;]</strong>.
        Refunds are handled per our{' '}
        <a href="/legal/refunds">Refund Policy</a> and the policy each
        Organizer sets for their own event.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        The Orkora name, logo, software, and design system are owned by{' '}
        <strong>[FILL IN: legal entity name]</strong>. Nothing in these Terms
        grants you a licence to use them other than to access the service as a
        normal user.
      </p>

      <h2>9. Termination</h2>
      <p>
        You may close your account at any time from your account settings or by
        contacting <a href="mailto:hello@orkora.io">hello@orkora.io</a>. We may
        suspend or terminate your access if you breach these Terms, if required
        by law, or to protect the platform and its users.
      </p>

      <h2>10. Disclaimers</h2>
      <p>
        Orkora is provided &quot;as is&quot; and &quot;as available&quot;. We
        do not warrant that the service will be uninterrupted, error-free, or
        free from security incidents. We do not endorse, vet, or guarantee any
        event listed on the platform.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Orkora is not liable for
        indirect, incidental, or consequential damages arising from your use of
        the service. Our total liability for any claim is capped at the greater
        of the platform fees you paid us in the 12 months before the claim, or{' '}
        <strong>[FILL IN: currency + amount, e.g. NGN 100,000]</strong>.
      </p>

      <h2>12. Indemnification</h2>
      <p>
        You agree to indemnify Orkora against any third-party claim arising
        from content you uploaded, an event you hosted, or your breach of these
        Terms.
      </p>

      <h2>13. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the{' '}
        <strong>[FILL IN: jurisdiction, e.g. Federal Republic of Nigeria]</strong>.
        Disputes will be resolved by the courts of{' '}
        <strong>[FILL IN: venue, e.g. Lagos, Nigeria]</strong>, except where
        applicable consumer law gives you a non-waivable right to a different
        forum.
      </p>

      <h2>14. Changes</h2>
      <p>
        We may update these Terms from time to time. Material changes will be
        notified by email or via the dashboard. Continued use of Orkora after
        the change means you accept the updated Terms.
      </p>

      <h2>15. Contact</h2>
      <p>
        Questions: <a href="mailto:hello@orkora.io">hello@orkora.io</a>. Legal
        notices: <strong>[FILL IN: registered address]</strong>.
      </p>
    </>
  );
}
