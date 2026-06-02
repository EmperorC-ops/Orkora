export const metadata = { title: 'Privacy Policy - Orkora' };

const LAST_UPDATED = '2 June 2026';

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-xs uppercase tracking-wider text-ink-muted">
        Last updated: {LAST_UPDATED}
      </p>
      <p>
        Full Privacy Policy available on request from{' '}
        <a href="mailto:privacy@orkora.events">privacy@orkora.events</a>{' '}
        during the private beta. Public posting follows counsel review.
      </p>
    </>
  );
}
