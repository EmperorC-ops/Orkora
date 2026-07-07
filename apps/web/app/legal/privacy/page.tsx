import { LegalMarkdown, readLegalMarkdown } from '@/lib/legal-markdown';

export const metadata = { title: 'Privacy Policy - Orkora' };

const source = readLegalMarkdown('privacy');

export default function PrivacyPage() {
  return <LegalMarkdown source={source} />;
}
