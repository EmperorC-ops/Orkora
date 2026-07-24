import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBrand, type Brand, type BrandEvent } from '@/lib/brand';
import SubscribeForm from './SubscribeForm';
import BrandHomeAnalytics from './BrandHomeAnalytics';

export const revalidate = 120;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const brand = await getBrand(params.slug);
  if (!brand) return { title: 'Brand' };
  const ogImage = `/og/brand/${encodeURIComponent(params.slug)}?format=og`;
  const description = brand.upcoming.length
    ? `Next up: ${brand.upcoming[0]?.title}. Follow ${brand.name} on Orkora.`
    : `${brand.name} on Orkora. The next event is coming.`;
  return {
    title: `${brand.name} on Orkora`,
    description,
    openGraph: {
      type: 'website',
      title: brand.name,
      description,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title: brand.name, description, images: [ogImage] },
  };
}

function eventHref(code: string): string {
  return `/e/${encodeURIComponent(code)}?source=brand_home`;
}

function formatDate(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: tz || 'UTC',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export default async function BrandHomePage({
  params,
}: {
  params: { slug: string };
}) {
  const brand = await getBrand(params.slug);
  if (!brand) notFound();

  const color = brand.brandColor || '#6C5CE7';
  const next = brand.upcoming[0] ?? null;

  return (
    <main className="min-h-screen bg-surface-deep text-ink-primary">
      <BrandHomeAnalytics slug={brand.slug} />
      {/* Header */}
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
          <span className="text-base font-semibold tracking-tight">{brand.name}</span>
          <nav className="ml-auto hidden gap-6 text-sm text-ink-secondary sm:flex">
            <a href="#events" className="transition hover:text-ink-primary">Events</a>
            {brand.past.length > 0 ? (
              <a href="#archive" className="transition hover:text-ink-primary">Past</a>
            ) : null}
            <a href="#connect" className="transition hover:text-ink-primary">Connect</a>
          </nav>
        </div>
      </header>

      {/* Hero (variant chosen in the composer) */}
      <Hero brand={brand} color={color} nextCode={next?.code ?? null} />

      <div className="mx-auto max-w-5xl space-y-16 px-6 py-16">
        {/* Upcoming */}
        <section id="events">
          <h2 className="mb-6 text-2xl font-bold">Upcoming</h2>
          {brand.upcoming.length === 0 ? (
            <p className="text-sm text-ink-secondary">
              No events on the calendar right now. This is where the next drop will appear.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {brand.upcoming.map((e) => (
                <EventCard key={e.code} event={e} color={color} />
              ))}
            </div>
          )}
        </section>

        {/* Archive */}
        {brand.past.length > 0 ? (
          <section id="archive">
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2 className="text-2xl font-bold">Past editions</h2>
              <Link
                href={`/o/${brand.slug}/past`}
                className="text-sm font-semibold text-brand-300 transition hover:text-brand-200"
              >
                See the full archive
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {brand.past.map((e) => (
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
                    <div className="mt-0.5 text-[11px] text-ink-muted">
                      {formatDate(e.startAt, e.timezone)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* Connect / community subscribe */}
        <section id="connect" className="rounded-2xl border border-surface-border bg-surface/40 p-8">
          <h2 className="text-2xl font-bold">Stay in the world</h2>
          <p className="mt-2 max-w-md text-sm text-ink-secondary">
            Get the next drop from {brand.name} before anyone else.
          </p>
          <div className="mt-5">
            <SubscribeForm slug={brand.slug} color={color} />
          </div>
        </section>
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

function Hero({
  brand,
  color,
  nextCode,
}: {
  brand: Brand;
  color: string;
  nextCode: string | null;
}) {
  const tagline =
    brand.tagline ??
    (nextCode ? 'The world is year-round. The next event is below.' : 'The next event is coming.');
  const hasMedia = !!brand.heroMediaUrl;
  const isVideo = brand.heroMediaType === 'video';

  const ctas = (
    <div className="mt-8 flex flex-wrap gap-3">
      {nextCode ? (
        <Link
          href={eventHref(nextCode)}
          className="inline-flex items-center rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-slate-900 shadow transition hover:bg-white/90"
        >
          See the next event
        </Link>
      ) : null}
      <a
        href="#connect"
        className="inline-flex items-center rounded-full border border-white/40 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
      >
        Subscribe
      </a>
    </div>
  );

  // Editorial: split layout with media on the right, name + bio on the left.
  if (brand.heroVariant === 'editorial') {
    return (
      <section className="border-b border-surface-border bg-surface-deep">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ink-muted">
              A world on Orkora
            </p>
            <h1 className="mt-4 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              {brand.name}
            </h1>
            {brand.heroBio ? (
              <p className="mt-6 max-w-md whitespace-pre-line text-lg text-ink-secondary">
                {brand.heroBio}
              </p>
            ) : (
              <p className="mt-6 max-w-md text-lg text-ink-secondary">{tagline}</p>
            )}
            {ctas}
          </div>
          <div
            className="aspect-[4/5] w-full overflow-hidden rounded-3xl border border-surface-border bg-cover bg-center"
            style={{
              backgroundColor: color,
              backgroundImage:
                hasMedia && !isVideo ? `url(${brand.heroMediaUrl})` : undefined,
            }}
          >
            {hasMedia && isVideo ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={brand.heroMediaUrl ?? undefined}
                autoPlay
                muted
                loop
                playsInline
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  // Cinematic: full-bleed media with the name overlaid. Falls back to gradient.
  if (brand.heroVariant === 'cinematic') {
    return (
      <section className="relative isolate overflow-hidden border-b border-surface-border">
        {hasMedia && isVideo ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={brand.heroMediaUrl ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundColor: color,
              backgroundImage: hasMedia ? `url(${brand.heroMediaUrl})` : undefined,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B14] via-[#0B0B14]/50 to-[#0B0B14]/20" />
        <div className="relative mx-auto flex min-h-[70vh] max-w-5xl flex-col justify-end px-6 py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
            A world on Orkora
          </p>
          <h1 className="mt-4 text-5xl font-extrabold leading-[1.02] tracking-tight text-white sm:text-7xl">
            {brand.name}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/85">{tagline}</p>
          {ctas}
        </div>
      </section>
    );
  }

  // Default: auto-composed gradient hero.
  return (
    <section
      className="relative overflow-hidden border-b border-surface-border"
      style={{
        backgroundImage: `radial-gradient(120% 120% at 0% 0%, ${color} 0%, rgba(11,11,20,0.25) 45%, #0B0B14 80%)`,
      }}
    >
      <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
          A world on Orkora
        </p>
        <h1 className="mt-4 text-5xl font-extrabold leading-[1.02] tracking-tight text-white sm:text-7xl">
          {brand.name}
        </h1>
        <p className="mt-6 max-w-xl text-lg text-white/80">{tagline}</p>
        {ctas}
      </div>
    </section>
  );
}

function EventCard({ event, color }: { event: BrandEvent; color: string }) {
  const kindLabel =
    event.kind === 'physical' ? 'In person' : event.kind === 'virtual' ? 'Virtual' : 'Hybrid';
  const live = event.status === 'live';
  return (
    <Link
      href={eventHref(event.code)}
      className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-2xl border border-surface-border"
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.03]"
        style={{
          backgroundImage: event.bannerUrl
            ? `url(${event.bannerUrl})`
            : `linear-gradient(135deg, ${color}, #0B0B14)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to top, rgba(11,11,20,0.92) 0%, rgba(11,11,20,0.25) 55%, rgba(11,11,20,0.05) 100%)`,
        }}
      />
      <div className="relative p-5">
        <div className="flex items-center gap-2">
          {live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> Live
            </span>
          ) : (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur">
              {kindLabel}
            </span>
          )}
        </div>
        <h3 className="mt-3 text-xl font-bold leading-tight text-white">{event.title}</h3>
        <p className="mt-1 text-sm text-white/75">{formatDate(event.startAt, event.timezone)}</p>
      </div>
    </Link>
  );
}
