import { LegalMarkdown, readLegalMarkdown } from '@/lib/legal-markdown';

export const metadata = { title: 'Refund Policy - Orkora' };

const source = readLegalMarkdown('refunds');

export default function RefundsPage() {
  return <LegalMarkdown source={source} />;
}
