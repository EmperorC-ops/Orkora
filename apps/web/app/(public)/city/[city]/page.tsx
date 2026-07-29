import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  browseEvents,
  discoverFacets,
  citySlug,
  type DiscoverEvent,
} from '@/lib/discover';

export const revalidate = 300;

// City is free text, so we resolve the URL slug back to the actual stored
// value via the facets list (which only contains cities that have events).
async function resolveCity(slug: string): Promise<string | null> {
  const facets = await discoverFacets();
  const match = facets.cities.find((c) => citySlug(c.city) === slug);
  return match?.city ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: { city: string };
}): Promise<Metadata> {
  const city = await resolveCity(params.city);
  if (!city) return { title: 'Events' };
  return {
    title: `Events in ${city}`,
    description: `Upcoming events in ${city} on Orkora. Discover and register for what's coming up.`,
    alternates: { canonical: `/city/${params.city}` },
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

export default async function CityPage({ params }: { params: { city: string } }) {
  const city = await resolveCity(params.city);
  if (!city) notFound();

  const { events } = await browseEvents({ city, take: 48 });

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
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Events in {city}</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          {events.length > 0
            ? `Upcoming events happening in ${city} on Orkora.`
            : `No upcoming events in ${city} right now. Check back soon.`}
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
        <div className="mt-0.5 truncate text-[11px] text-ink-muted">{e.organization.name}</div>
        <div className="mt-0.5 text-[11px] text-ink-muted">{formatDate(e.startAt, e.timezone)}</div>
      </div>
    </Link>
  );
}
