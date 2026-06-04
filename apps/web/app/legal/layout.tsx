import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '@/components/brand';

/**
 * Shared layout for every page under /legal. Wraps content in the dark theme
 * shared with the rest of the app, prepends a draft-notice banner so reviewers
 * see at a glance that these are pre-counsel-review templates, and pins a
 * "questions" contact line at the bottom.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-surface-deep text-ink-primary">
      <header className="border-b border-surface-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center" aria-label="Orkora home">
            <Brand variant="lockup" width={440} className="h-28 w-auto" />
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
        <div className="mb-10 rounded-xl border border-[#FF7675]/30 bg-[#FF7675]/5 px-4 py-3 text-xs leading-6 text-[#FFC8C8]">
          <strong className="text-[#FF7675]">Draft for review by counsel.</strong>{' '}
          Every clause is grounded in current product behavior. Items in square brackets like{' '}
          <code className="mx-1 rounded bg-[#FF7675]/15 px-1.5 py-0.5 text-[10px]">[BRACKETED]</code>{' '}
          need a company-specific value before public launch. Privacy clauses are aligned to the
          Nigeria Data Protection Regulation (NDPR), the Nigeria Data Protection Act 2023, and the
          EU/UK GDPR.
        </div>

        <article className="space-y-5 text-sm leading-7 text-ink-secondary [&_h1]:mb-2 [&_h1]:mt-0 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-ink-primary [&_h2]:mb-2 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink-primary [&_strong]:text-ink-primary [&_a]:text-brand-300 [&_a:hover]:text-brand-200 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_code]:rounded [&_code]:bg-surface/60 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs">
          {children}
        </article>

        <footer className="mt-16 border-t border-surface-border pt-6 text-xs text-ink-muted">
          Questions about this document?{' '}
          <a
            className="text-ink-secondary transition hover:text-ink-primary"
            href="mailto:hello@orkora.events"
          >
            hello@orkora.events
          </a>
 