import { LegalMarkdown, readLegalMarkdown } from '@/lib/legal-markdown';

export const metadata = { title: 'Terms of Service - Orkora' };

const source = readLegalMarkdown('terms');

export default function TermsPage() {
  return <LegalMarkdown source={source} />;
}
