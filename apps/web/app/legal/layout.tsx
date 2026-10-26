import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '@/components/brand';
import { ContactEmail } from '@/components/contact-email';
import { LegalEntityLine } from '@/components/legal-entity';

/**
 * Shared layout for every page under /legal. Wraps content in the dark
 * theme shared with the rest of the app, prepends a short "last updated /
 * changes are announced in advance" note, and pins a "questions" contact line
 * at the bottom.
 *
 * Earlier versions carried a review banner and then a private-beta note; both
 * were retired at general availability (2026-10). apps/web/legal/*.md are the
 * only copies of the texts; lib/legal-markdown.tsx still strips any stray
 * [COUNSEL NOTE: ...] marker from the rendered output as a safeguard.
 */
// Next.js App Router only permits a specific set of named exports from a
// layout.tsx (default, metadata, generateMetadata, viewport, ...). Anything
// else trips a build-time type error in `.next/types`. Keep the display date
// as a local const.
const LAST_UPDATED = '26 October 2026';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-surface-deep text-ink-primary">
      <header className="border-b border-surface-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center" aria-label="Orkora home">
            <Brand variant="lockup" width={240} className="h-12 w-auto" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-ink-secondary transition hover:text-ink-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to home
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10 rounded-xl border border-brand-500/25 bg-brand-500/5 px-4 py-3 text-xs leading-6 text-ink-secondary">
          These policies reflect the platform as it operates today. We may update them as the platform evolves;
          material changes will be announced at least 30 days in advance. Last updated{' '}
          {LAST_UPDATED}. Questions? <ContactEmail address="hello@orkora.events" className="text-xs" />
        </div>

        <article>{children}</article>

        <footer className="mt-16 border-t border-surface-border pt-6 text-xs text-ink-muted">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-1.5">
              Questions about this document?{' '}
              <ContactEmail address="hello@orkora.events" className="text-xs" />
            </span>
            <span className="flex items-center gap-1.5">
              Privacy or data-subject requests:{' '}
              <ContactEmail address="privacy@orkora.events" className="text-xs" />
            </span>
          </div>
          <LegalEntityLine className="mt-4" />
        </footer>
      </div>
    </main>
  );
}
