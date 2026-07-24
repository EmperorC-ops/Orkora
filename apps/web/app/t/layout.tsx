import type { Metadata } from 'next';

/**
 * Ticket pages must never be indexed: a shared or leaked ticket URL should not
 * turn up in search results. A server layout lets us set robots noindex even
 * though the ticket page itself is a client component.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TicketLayout({ children }: { children: React.ReactNode }) {
  return children;
}
