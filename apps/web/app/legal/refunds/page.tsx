export const metadata = { title: 'Refund Policy - Orkora' };

const LAST_UPDATED = '2 June 2026';

export default function RefundsPage() {
  return (
    <>
      <h1>Refund Policy</h1>
      <p className="text-xs uppercase tracking-wider text-ink-muted">
        Last updated: {LAST_UPDATED}
      </p>
      <p>
        Each Organizer publishes their own event-level refund terms on the
        event page, and you accept those terms when you complete checkout.
        Full platform Refund Policy available on request from{' '}
        <a href="mailto:support@orkora.events">support@orkora.events</a>{' '}
        during the private beta.
      </p>
    </>
  );
}
