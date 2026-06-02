export const metadata = { title: 'Terms of Service - Orkora' };

const LAST_UPDATED = '2 June 2026';

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="text-xs uppercase tracking-wider text-ink-muted">
        Last updated: {LAST_UPDATED}
      </p>
      <p>
        Full Terms of Service available on request from{' '}
        <a href="mailto:hello@orkora.events">hello@orkora.events</a> during
        the private beta. Public posting follows counsel review.
      </p>
    </>
  );
}
