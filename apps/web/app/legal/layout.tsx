import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '@/components/brand';

/**
 * Shared layout for every page under /legal. Wraps content in the dark
 * theme shared with the rest of the app, prepends a light beta-version
 * banner, and pins a "questions" contact line at the bottom.
 *
 * The previous "Draft for review by counsel" red banner was intended for
 * counsel and internal reviewers; now that the pages ship for real users,
 * we replace it with a shorter beta note that keeps the "still evolving"
 * signal without shouting DRAFT. The full counsel-marked-up source with
 * [COUNSEL NOTE: ...] markers is retained at LEGAL/*.md at repo root and
 * stripped from the rendered output by lib/legal-markdown.tsx.
 */
// Next.js App Router only permits a specific set of named exports from a
// layout.tsx (default, metadata, generateMetadata, viewport, ...). Anything
// else trips a build-time type error in `.next/types`. Keep the display date
// as a local const.
const LAST_UPDATED = '7 July 2026';

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
          <strong className="text-brand-300">Beta version.</strong>{' '}
          Orkora is in private beta, and these policies reflect the platform as it operates today. We may update them
          as the platform evolves; material changes will be announced at least 30 days in advance. Last updated{' '}
          {LAST_UPDATED}. Questions?{' '}
          <a className="underline decoration-brand-500/40 underline-offset-2 hover:text-ink-primary" href="mailto:hello@orkora.events">
            hello@orkora.events
          </a>.
        </div>

        <article>{children}</article>

        <footer className="mt-16 border-t border-surface-border pt-6 text-xs text-ink-muted">
          Questions about this document?{' '}
          <a
            className="text-ink-secondary transition hover:text-ink-primary"
            href="mailto:hello@orkora.events"
          >
            hello@orkora.events
          </a>
          . Privacy or data-subject requests:{' '}
          <a
            className="text-ink-secondary transition hover:text-ink-primary"
            href="mailto:privacy@orkora.events"
          >
            privacy@orkora.events
          </a>
          .
        </footer>
      </div>
    </main>
  );
}
