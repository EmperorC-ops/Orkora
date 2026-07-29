import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { browseEvents, type DiscoverEvent } from '@/lib/discover';
import { EVENT_CATEGORIES, categoryLabel } from '@/lib/events';

export const revalidate = 300;

// Only the known category slugs resolve; anything else 404s so we never index
// arbitrary strings.
function isKnownCategory(slug: string): boolean {
  return EVENT_CATEGORIES.some((c) => c.slug === slug);
}

export async function generateMetadata({
  params,
}: {
  params: { category: string };
}): Promise<Metadata> {
  if (!isKnownCategory(params.category)) return { title: 'Events' };
  const label = categoryLabel(params.category);
  return {
    title: `${label} events`,
    description: `Upcoming ${label} events on Orkora. Discover and register for what's coming up.`,
    alternates: { canonical: `/c/${params.category}` },
  };
}

function formatDate(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: tz || 'UTC',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export default async function CategoryPage({ params }: { params: { category: string } }) {
  if (!isKnownCategory(params.category)) notFound();

  const label = categoryLabel(params.category);
  const { events } = await browseEvents({ category: params.category, take: 48 });

  return (
    <main className="min-h-screen bg-surface-deep text-ink-primary">
      <header className="sticky top-0 z-20 border-b border-surface-border bg-surface-deep/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-6">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Orkora
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{label} events</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          {events.length > 0
            ? `Upcoming ${label?.toLowerCase()} events on Orkora.`
            : `No upcoming ${label?.toLowerCase()} events right now. Check back soon.`}
        </p>

        {events.length > 0 && (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {events.map((e) => (
              <EventCard key={e.code} event={e} />
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-surface-border bg-surface/40 py-8 text-center text-xs text-ink-muted">
        Powered by{' '}
        <Link href="/" className="font-semibold text-brand-300 hover:text-brand-200">
          Orkora
        </Link>
      </footer>
    </main>
  );
}

function EventCard({ event: e }: { event: DiscoverEvent }) {
  const color = e.organization.brandColor || '#6C5CE7';
  return (
    <Link
      href={`/e/${encodeURIComponent(e.code)}?source=discover`}
      className="group block overflow-hidden rounded-xl border border-surface-border bg-surface/40"
    >
      <div
        className="aspect-[4/3] w-full bg-cover bg-center opacity-90 transition group-hover:opacity-100"
        style={{
          backgroundImage: e.bannerUrl
            ? `url(${e.bannerUrl})`
            : `linear-gradient(135deg, ${color}, #0B0B14)`,
        }}
      />
      <div className="p-3">
        <div className="truncate text-sm font-semibold text-ink-primary">{e.title}</div>
        <div className="mt-0.5 truncate text-[11px] text-ink-muted">
          {e.organization.name}
          {e.city ? ` · ${e.city}` : ''}
        </div>
        <div className="mt-0.5 text-[11px] text-ink-muted">{formatDate(e.startAt, e.timezone)}</div>
      </div>
    </Link>
  );
}
