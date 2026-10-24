import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '@/components/brand';
import { HelpMarkdown } from '@/lib/help-markdown';
import { PUBLIC_HELP } from '@/lib/help-public';

export const metadata: Metadata = {
  title: 'Help - Orkora',
  description: 'Answers for attendees and organizers: tickets, the live room, getting started and support.',
  alternates: { canonical: '/help' },
};

/**
 * Public help. Organizer guidance beyond the basics lives in the dashboard
 * (Dashboard, then Help), where each team member sees what their role needs.
 */
export default function HelpPage() {
  return (
    <main className="relative min-h-screen bg-surface-deep text-ink-primary">
      <header className="border-b border-surface-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center" aria-label="Orkora home">
            <Brand variant="lockup" width={160} className="h-9 w-auto" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Help</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">How can we help?</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Organizers: the full guide for your role is in your dashboard under{' '}
          <Link href="/dashboard/help" className="font-semibold text-brand-300 underline hover:text-brand-200">
            Help
          </Link>
          .
        </p>
        <div className="mt-6">
          <HelpMarkdown source={PUBLIC_HELP} />
        </div>
      </section>
    </main>
  );
}
