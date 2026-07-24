import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBrand, type BrandEvent } from '@/lib/brand';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const brand = await getBrand(params.slug);
  if (!brand) return { title: 'Past editions' };
  return {
    title: `Past editions | ${brand.name}`,
    description: `Every past edition from ${brand.name} on Orkora.`,
    alternates: { canonical: `/o/${brand.slug}/past` },
  };
}

function eventHref(code: string): string {
  return `/e/${encodeURIComponent(code)}?source=brand_home`;
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

export default async function BrandPastPage({ params }: { params: { slug: string } }) {
  const brand = await getBrand(params.slug);
  if (!brand) notFound();

  const color = brand.brandColor || '#6C5CE7';

  return (
    <main className="min-h-screen bg-surface-deep text-ink-primary">
      <header className="sticky top-0 z-20 border-b border-surface-border bg-surface-deep/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-6">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {brand.name.charAt(0).toUpperCase()}
            </span>
          )}
          <Link href={`/o/${brand.slug}`} className="text-base font-semibold tracking-tight">
            {brand.name}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-16">
        <Link
          href={`/o/${brand.slug}`}
          className="text-sm text-ink-secondary transition hover:text-ink-primary"
        >
          &larr; Back to {brand.name}
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Past editions</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          The full archive of everything {brand.name} has run on Orkora.
        </p>

        {brand.past.length === 0 ? (
          <p className="mt-10 text-sm text-ink-secondary">No past editions yet.</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {brand.past.map((e: BrandEvent) => (
              <Link
                key={e.code}
                href={eventHref(e.code)}
                className="group block overflow-hidden rounded-xl border border-surface-border bg-surface/40"
              >
                <div
                  className="aspect-[4/3] w-full bg-cover bg-center opacity-80 transition group-hover:opacity-100"
                  style={{
                    backgroundImage: e.bannerUrl
                      ? `url(${e.bannerUrl})`
                      : `linear-gradient(135deg, ${color}, #0B0B14)`,
                  }}
                />
                <div className="p-3">
                  <div className="truncate text-sm font-semibold text-ink-primary">{e.title}</div>
                  <div className="mt-0.5 text-[11px] text-ink-muted">{formatDate(e.startAt, e.timezone)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-surface-border bg-surface/40 py-8 text-center text-xs text-ink-muted">
        {brand.name} · Powered by{' '}
        <Link href="/" className="font-semibold text-brand-300 hover:text-brand-200">
          Orkora
        </Link>
      </footer>
    </main>
  );
}
