export const metadata = { title: 'Organizer Agreement - Orkora' };

const LAST_UPDATED = '2 June 2026';

export default function OrganizerAgreementPage() {
  return (
    <>
      <h1>Organizer Agreement</h1>
      <p className="text-xs uppercase tracking-wider text-ink-muted">
        Last updated: {LAST_UPDATED}
      </p>
      <p>
        Full Organizer Agreement available on request from{' '}
        <a href="mailto:hello@orkora.events">hello@orkora.events</a> during
        the private beta. Public posting follows counsel review.
      </p>
    </>
  );
}
