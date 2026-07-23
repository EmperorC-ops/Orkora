import Link from 'next/link';
import StoryTicketsBar from './StoryTicketsBar';
import type { StoryBlock, CastPerson } from '@/lib/story';

/**
 * Story Mode public renderer. Reads an event's composed block sequence and
 * renders block by block. Server-rendered for SEO. The floating tickets bar is
 * the only client island.
 *
 * Agenda and Tickets blocks render from the event's own data (sessions, tiers)
 * rather than block content, so they always reflect the live event.
 */

interface StorySession {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  trackId: string | null;
}

interface StorySpeaker {
  id: string;
  fullName: string;
  title: string | null;
  avatarUrl: string | null;
}

interface StoryTier {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  quantityTotal: number | null;
  quantitySold: number;
  isGroup: boolean;
  groupSize: number | null;
}

export interface StoryEvent {
  code: string;
  title: string;
  timezone: string;
  bannerUrl: string | null;
  status: string;
  storyBlocks: StoryBlock[];
  organization: { name: string; logoUrl?: string | null; brandColor?: string | null; slug?: string };
  sessions?: StorySession[];
  speakers?: StorySpeaker[];
  tiers?: StoryTier[];
}

function formatPrice(priceMinor: number, currency: string): string {
  if (priceMinor === 0) return 'Free';
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency.toUpperCase() }).format(
      priceMinor / 100,
    );
  } catch {
    return `${currency.toUpperCase()} ${(priceMinor / 100).toFixed(2)}`;
  }
}

function formatDay(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-NG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: tz || 'UTC',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function formatTime(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-NG', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz || 'UTC',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export default function StoryRenderer({ event }: { event: StoryEvent }) {
  const color = event.organization.brandColor || '#6C5CE7';
  const blocks = (event.storyBlocks ?? []).filter((b) => b && b.hidden !== true);
  const registerHref = `/e/${event.code}/register`;

  return (
    <main className="min-h-screen bg-surface-deep text-ink-primary">
      {/* Slim brand bar */}
      <header className="sticky top-0 z-20 border-b border-surface-border bg-surface-deep/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-6">
          {event.organization.slug ? (
            <Link href={`/o/${event.organization.slug}`} className="text-sm font-semibold tracking-tight">
              {event.organization.name}
            </Link>
          ) : (
            <span className="text-sm font-semibold tracking-tight">{event.organization.name}</span>
          )}
          <Link
            href={registerHref}
            className="ml-auto rounded-full px-4 py-1.5 text-xs font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            Register
          </Link>
        </div>
      </header>

      {blocks.map((block) => (
        <BlockView key={block.id} block={block} event={event} color={color} registerHref={registerHref} />
      ))}

      <footer className="border-t border-surface-border bg-surface/40 py-8 text-center text-xs text-ink-muted">
        Powered by{' '}
        <Link href="/" className="font-semibold text-brand-300 hover:text-brand-200">
          Orkora
        </Link>
      </footer>

      <StoryTicketsBar color={color} />
    </main>
  );
}

function BlockView({
  block,
  event,
  color,
  registerHref,
}: {
  block: StoryBlock;
  event: StoryEvent;
  color: string;
  registerHref: string;
}) {
  switch (block.type) {
    case 'hero':
      return <HeroBlock block={block} event={event} color={color} registerHref={registerHref} />;
    case 'editorial':
      return (
        <section className="mx-auto max-w-3xl px-6 py-12">
          {block.data.pullQuote ? (
            <p className="mb-6 border-l-4 pl-5 text-2xl font-semibold leading-snug" style={{ borderColor: color }}>
              {block.data.pullQuote}
            </p>
          ) : null}
          <div className="whitespace-pre-line text-lg leading-relaxed text-ink-secondary">{block.data.body}</div>
        </section>
      );
    case 'pullQuote':
      return (
        <section className="mx-auto max-w-3xl px-6 py-10">
          <blockquote className="border-l-4 pl-6 text-3xl font-bold leading-tight text-ink-primary" style={{ borderColor: color }}>
            {block.data.quote}
          </blockquote>
          {block.data.attribution ? (
            <p className="mt-3 pl-6 text-sm text-ink-muted">{block.data.attribution}</p>
          ) : null}
        </section>
      );
    case 'cast':
      return <CastBlock block={block} event={event} />;
    case 'moodboard':
      return <MoodboardBlock block={block} />;
    case 'playlist':
      return <PlaylistBlock block={block} color={color} />;
    case 'agenda':
      return <AgendaBlock block={block} event={event} color={color} />;
    case 'tickets':
      return <TicketsBlock block={block} event={event} color={color} registerHref={registerHref} />;
    case 'faq':
      return <FaqBlock block={block} />;
    case 'brandCollab':
      return <BrandCollabBlock block={block} color={color} />;
    case 'location':
      return <LocationBlock block={block} color={color} />;
    default:
      return null;
  }
}

function HeroBlock({
  block,
  event,
  color,
  registerHref,
}: {
  block: Extract<StoryBlock, { type: 'hero' }>;
  event: StoryEvent;
  color: string;
  registerHref: string;
}) {
  const { data } = block;
  const headline = data.headline || event.title;
  const mediaUrl = data.mediaUrl || event.bannerUrl;
  const isVideo = data.mediaType === 'video';

  const ctas = (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link
        href={registerHref}
        className="inline-flex items-center rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-slate-900 shadow transition hover:bg-white/90"
      >
        {data.ctaPrimaryText || 'Get tickets'}
      </Link>
      <a
        href="#tickets"
        className="inline-flex items-center rounded-full border border-white/40 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
      >
        See tickets
      </a>
    </div>
  );

  if (block.variant === 'minimal') {
    return (
      <section data-story-hero className="border-b border-surface-border" style={{ backgroundColor: color }}>
        <div className="mx-auto max-w-4xl px-6 py-28 sm:py-36">
          <h1 className="text-5xl font-extrabold leading-[1.02] tracking-tight text-white sm:text-7xl">{headline}</h1>
          {data.dateCityLine ? <p className="mt-5 text-lg text-white/85">{data.dateCityLine}</p> : null}
          {data.subheadline ? <p className="mt-2 text-lg text-white/70">{data.subheadline}</p> : null}
          {ctas}
        </div>
      </section>
    );
  }

  return (
    <section data-story-hero className="relative isolate overflow-hidden border-b border-surface-border">
      {mediaUrl && isVideo ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={mediaUrl} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundColor: color, backgroundImage: mediaUrl ? `url(${mediaUrl})` : undefined }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B14] via-[#0B0B14]/50 to-[#0B0B14]/20" />
      <div className="relative mx-auto flex min-h-[70vh] max-w-4xl flex-col justify-end px-6 py-20">
        <h1 className="text-5xl font-extrabold leading-[1.02] tracking-tight text-white sm:text-7xl">{headline}</h1>
        {data.dateCityLine ? <p className="mt-5 text-lg text-white/85">{data.dateCityLine}</p> : null}
        {data.subheadline ? <p className="mt-2 max-w-xl text-lg text-white/75">{data.subheadline}</p> : null}
        {ctas}
      </div>
    </section>
  );
}

function CastBlock({
  block,
  event,
}: {
  block: Extract<StoryBlock, { type: 'cast' }>;
  event: StoryEvent;
}) {
  const fromSpeakers: CastPerson[] =
    block.data.useEventSpeakers && block.data.people.length === 0
      ? (event.speakers ?? []).map((s) => ({
          name: s.fullName,
          role: s.title,
          avatarUrl: s.avatarUrl,
          social: null,
          bio: null,
        }))
      : block.data.people;

  if (fromSpeakers.length === 0) return null;

  if (block.data.variant === 'list') {
    return (
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="mb-6 text-2xl font-bold">Line-up</h2>
        <ul className="divide-y divide-surface-border">
          {fromSpeakers.map((p, i) => (
            <li key={i} className="flex items-baseline justify-between gap-4 py-3">
              <span className="text-lg font-semibold text-ink-primary">{p.name}</span>
              {p.role ? <span className="text-sm text-ink-muted">{p.role}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const cols = block.data.columns === 4 ? 'sm:grid-cols-4' : block.data.columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3';
  return (
    <section className="mx-auto max-w-4xl px-6 py-12">
      <h2 className="mb-6 text-2xl font-bold">Line-up</h2>
      <div className={`grid grid-cols-2 gap-6 ${cols}`}>
        {fromSpeakers.map((p, i) => (
          <div key={i} className="text-center">
            <div className="mx-auto h-24 w-24 overflow-hidden rounded-full bg-surface-raised">
              {p.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatarUrl} alt={p.name} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <p className="mt-3 font-semibold text-ink-primary">{p.name}</p>
            {p.role ? <p className="text-xs text-ink-secondary">{p.role}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function MoodboardBlock({ block }: { block: Extract<StoryBlock, { type: 'moodboard' }> }) {
  const tiles = block.data.tiles ?? [];
  if (tiles.length === 0) return null;
  return (
    <section className="mx-auto max-w-4xl px-6 py-12">
      <div className="columns-2 gap-4 sm:columns-3 [&>*]:mb-4">
        {tiles.map((t, i) => (
          <figure key={i} className="overflow-hidden rounded-xl border border-surface-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.url} alt={t.caption ?? ''} className="w-full" />
            {t.caption ? <figcaption className="px-3 py-2 text-xs text-ink-muted">{t.caption}</figcaption> : null}
          </figure>
        ))}
      </div>
    </section>
  );
}

function PlaylistBlock({ block, color }: { block: Extract<StoryBlock, { type: 'playlist' }>; color: string }) {
  const { data } = block;
  if (data.variant === 'embed' && data.embedUrl) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="overflow-hidden rounded-2xl border border-surface-border" style={{ borderColor: `${color}55` }}>
          <iframe
            src={data.embedUrl}
            title="Playlist"
            loading="lazy"
            className="h-[352px] w-full"
            allow="encrypted-media; clipboard-write; autoplay; fullscreen"
          />
        </div>
      </section>
    );
  }
  if (data.tracks.length > 0) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="mb-4 text-2xl font-bold">The playlist</h2>
        <ol className="space-y-2">
          {data.tracks.map((t, i) => (
            <li key={i} className="flex items-baseline gap-3 text-ink-secondary">
              <span className="text-sm tabular-nums text-ink-muted">{String(i + 1).padStart(2, '0')}</span>
              <span className="font-medium text-ink-primary">{t.title}</span>
              {t.artist ? <span className="text-sm text-ink-muted">{t.artist}</span> : null}
            </li>
          ))}
        </ol>
      </section>
    );
  }
  return null;
}

function AgendaBlock({
  block,
  event,
  color,
}: {
  block: Extract<StoryBlock, { type: 'agenda' }>;
  event: StoryEvent;
  color: string;
}) {
  const sessions = [...(event.sessions ?? [])].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  if (sessions.length === 0) return null;
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <h2 className="mb-6 text-2xl font-bold">{block.data.heading || 'Agenda'}</h2>
      <ul className="overflow-hidden rounded-xl border border-surface-border bg-surface">
        {sessions.map((s, idx) => (
          <li
            key={s.id}
            className={`flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:gap-6 ${idx > 0 ? 'border-t border-surface-border' : ''}`}
          >
            <span className="w-40 shrink-0 text-sm font-semibold" style={{ color }}>
              {formatDay(s.startAt, event.timezone)}
              <span className="block text-xs font-normal text-ink-muted">
                {formatTime(s.startAt, event.timezone)} - {formatTime(s.endAt, event.timezone)}
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink-primary">{s.title}</p>
              {s.description ? <p className="mt-1 text-sm text-ink-secondary">{s.description}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TicketsBlock({
  block,
  event,
  color,
  registerHref,
}: {
  block: Extract<StoryBlock, { type: 'tickets' }>;
  event: StoryEvent;
  color: string;
  registerHref: string;
}) {
  const tiers = event.tiers ?? [];
  return (
    <section id="tickets" className="mx-auto max-w-3xl scroll-mt-16 px-6 py-14">
      <h2 className="mb-6 text-2xl font-bold">{block.data.heading || 'Tickets'}</h2>
      {tiers.length === 0 ? (
        <p className="text-sm text-ink-secondary">Tickets are not on sale yet. Check back soon.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {tiers.map((tier) => {
            const remaining = tier.quantityTotal ? Math.max(0, tier.quantityTotal - tier.quantitySold) : null;
            const soldOut = remaining === 0;
            return (
              <div key={tier.id} className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface/40 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-primary">{tier.name}</p>
                    {tier.isGroup && tier.groupSize && tier.groupSize > 1 ? (
                      <span className="mt-0.5 inline-block rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-300">
                        Group of {tier.groupSize}+
                      </span>
                    ) : null}
                    {tier.description ? <p className="mt-0.5 text-sm text-ink-secondary">{tier.description}</p> : null}
                  </div>
                  <span className="shrink-0 rounded-full px-3 py-1 text-sm font-bold text-white" style={{ backgroundColor: color }}>
                    {formatPrice(tier.priceMinor, tier.currency)}
                  </span>
                </div>
                {remaining !== null ? (
                  <p className="text-xs text-ink-muted">{soldOut ? 'Sold out' : `${remaining} remaining`}</p>
                ) : null}
                <Link
                  href={soldOut ? registerHref : `${registerHref}?tier=${tier.id}`}
                  aria-disabled={soldOut}
                  className={`mt-auto inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                    soldOut ? 'cursor-not-allowed bg-surface-raised text-ink-muted' : 'text-white hover:opacity-90'
                  }`}
                  style={soldOut ? undefined : { backgroundColor: color }}
                >
                  {soldOut ? 'Sold out' : 'Register'}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FaqBlock({ block }: { block: Extract<StoryBlock, { type: 'faq' }> }) {
  const items = block.data.items ?? [];
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <h2 className="mb-6 text-2xl font-bold">{block.data.heading || 'Questions'}</h2>
      <div className="divide-y divide-surface-border rounded-xl border border-surface-border">
        {items.map((it, i) => (
          <details key={i} className="group p-4">
            <summary className="cursor-pointer list-none font-semibold text-ink-primary">{it.q}</summary>
            <p className="mt-2 whitespace-pre-line text-sm text-ink-secondary">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function BrandCollabBlock({ block, color }: { block: Extract<StoryBlock, { type: 'brandCollab' }>; color: string }) {
  const { data } = block;
  if (!data.partnerName && !data.text) return null;
  const inner = (
    <div className="flex items-center gap-5 rounded-2xl border border-surface-border bg-surface/40 p-5">
      {data.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.imageUrl} alt={data.partnerName} className="h-16 w-16 rounded-xl object-cover" />
      ) : null}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
          In partnership with
        </p>
        <p className="text-lg font-bold text-ink-primary">{data.partnerName}</p>
        {data.text ? <p className="mt-1 text-sm text-ink-secondary">{data.text}</p> : null}
      </div>
    </div>
  );
  return (
    <section className="mx-auto max-w-3xl px-6 py-8">
      {data.url ? (
        <a href={data.url} target="_blank" rel="noreferrer" className="block transition hover:opacity-90">
          {inner}
        </a>
      ) : (
        inner
      )}
    </section>
  );
}

function LocationBlock({ block, color }: { block: Extract<StoryBlock, { type: 'location' }>; color: string }) {
  const { data } = block;
  if (!data.address && !data.mapEmbedUrl) return null;
  const directions = data.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.address)}`
    : null;
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <h2 className="mb-4 text-2xl font-bold">Location</h2>
      {data.mapEmbedUrl ? (
        <div className="mb-4 overflow-hidden rounded-2xl border border-surface-border">
          <iframe src={data.mapEmbedUrl} title="Map" loading="lazy" className="h-72 w-full" />
        </div>
      ) : null}
      {data.address ? <p className="text-ink-secondary">{data.address}</p> : null}
      {data.approximate ? (
        <p className="mt-1 text-xs text-ink-muted">Approximate. Exact address sent after ticket purchase.</p>
      ) : null}
      {directions ? (
        <a
          href={directions}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color }}
        >
          Directions
        </a>
      ) : null}
    </section>
  );
}
