import { LegalMarkdown, readLegalMarkdown } from '@/lib/legal-markdown';

export const metadata = { title: 'Organizer Agreement - Orkora' };

const source = readLegalMarkdown('organizer');

export default function OrganizerAgreementPage() {
  return <LegalMarkdown source={source} />;
}
