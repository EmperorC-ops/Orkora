import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { dayKeyInTz, sameCalendarDay } from '@/lib/events';
import { usesStoryMode, type StoryBlock } from '@/lib/story';
import StoryRenderer from './StoryRenderer';
import EventArrivalAnalytics from './EventArrivalAnalytics';
import InstallPrompt from '../../../_components/InstallPrompt';
import FeedbackForm from '../../../_components/FeedbackForm';

interface PublicTier {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  quantityTotal: number | null;
  quantitySold: number;
  minPerOrder: number;
  maxPerOrder: number;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  isGroup: boolean;
  groupSize: number | null;
  position: number;
}

interface PublicSession {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  trackId: string | null;
  streamUrl?: string | null;
}

interface PublicSpeaker {
  id: string;
  fullName: string;
  title: string | null;
  bio: string | null;
  avatarUrl: string | null;
  socialLinks: Record<string, string>;
}

interface PublicTrack {
  id: string;
  name: string;
  color: string | null;
}

interface PublicEvent {
  id: string;
  code: string;
  slug: string;
  title: string;
  description: string | null;
  kind: 'physical' | 'virtual' | 'hybrid';
  startAt: string;
  endAt: string;
  timezone: string;
  bannerUrl: string | null;
  status: 'draft' | 'published' | 'live' | 'ended' | 'archived';
  storyBlocks?: StoryBlock[];
  storyTemplate?: string;
  storyPublishedAt?: string | null;
  storyPreview?: boolean;
  organization: { name: string; logoUrl: string | null; brandColor: string | null; slug?: string };
  tracks?: PublicTrack[];
  sessions?: PublicSession[];
  speakers?: PublicSpeaker[];
  tiers?: PublicTier[];
}

async function getEvent(code: string, preview?: string): Promise<PublicEvent | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  // A preview link must never be served from the shared cache, and must be
  // re-validated on every request (the draft changes as the organiser edits).
  const qs = preview ? `?preview=${encodeURIComponent(preview)}` : '';
  const opts: RequestInit & { next?: { revalidate: number } } = preview
    ? { cache: 'no-store' }
    : { next: { revalidate: 60 } };
  // Public code endpoint returns the minimal shape; fetch the full one via id.
  const codeRes = await fetch(`${apiUrl}/v1/events/by-code/${code}${qs}`, opts);
  if (!codeRes.ok) return null;
  const minimal = (await codeRes.json()) as { id: string; organization: { slug?: string }; slug: string };
  if (!minimal.organization.slug) return (await codeRes.json()) as PublicEvent;
  // Re-fetch via slug endpoint for the richer payload (tracks, sessions, speakers, tiers).
  const slugRes = await fetch(
    `${apiUrl}/v1/events/by-slug/${minimal.organization.slug}/${minimal.slug}${qs}`,
    opts,
  );
  if (slugRes.ok) return (await slugRes.json()) as PublicEvent;
  return (await codeRes.json()) as PublicEvent;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams?: { preview?: string };
}): Promise<Metadata> {
  const preview = typeof searchParams?.preview === 'string' ? searchParams.preview : undefined;
  const event = await getEvent(params.code, preview);
  // Branded, designed OG card for link unfurls (WhatsApp, X, iMessage, Slack).
  // Falls back to the raw banner only if the event did not resolve.
  const ogImage = event
    ? `/og/event/${encodeURIComponent(params.code)}?format=og`
    : event?.bannerUrl;
  return {
    title: event?.title ?? 'Event',
    description: event?.description ?? undefined,
    openGraph: {
      type: 'website',
      title: event?.title,
      description: event?.description ?? undefined,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: event?.title,
      description: event?.description ?? undefined,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

function formatPrice(priceMinor: number, currency: string): string {
  if (priceMinor === 0) return 'Free';
  const major = priceMinor / 100;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(major);
  } catch {
    return `${currency.toUpperCase()} ${major.toFixed(2)}`;
  }
}

function formatDay(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}

function formatTime(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}

function groupSessionsByDay(sessions: PublicSession[], timeZone?: string) {
  const groups: Record<string, PublicSession[]> = {};
  for (const session of [...sessions].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  )) {
    const key = dayKeyInTz(new Date(session.startAt), timeZone);
    (groups[key] ??= []).push(session);
  }
  return Object.entries(groups);
}

export default async function PublicEventPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams?: { preview?: string };
}) {
  const preview = typeof searchParams?.preview === 'string' ? searchParams.preview : undefined;
  const event = await getEvent(params.code, preview);
  if (!event) notFound();

  // Story Mode: render the block narrative when the organiser has published a
  // story, OR when this is an authorized preview link (draft, unpublished).
  // Every other event falls through to the classic layout below, untouched.
  const isPreview = event.storyPreview === true;
  const hasBlocks = (event.storyBlocks?.length ?? 0) > 0;
  if (usesStoryMode(event) || (isPreview && hasBlocks)) {
    return (
      <>
        <EventArrivalAnalytics slug={event.organization.slug ?? ''} />
        {isPreview && !event.storyPublishedAt ? (
          <div className="bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-slate-900">
            Preview - this Story Mode draft is not published yet.
          </div>
        ) : null}
        <InstallPrompt variant="banner" />
        <StoryRenderer event={{ ...event, storyBlocks: event.storyBlocks ?? [] }} />
        {(event.status === 'live' || event.status === 'ended') && (
          <div className="mx-auto max-w-3xl px-6 pb-16">
            <FeedbackForm
              code={event.code}
              sessions={(event.sessions ?? []).map((s) => ({ id: s.id, title: s.title }))}
            />
          </div>
        )}
      </>
    );
  }

  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const sameDay = sameCalendarDay(start, end, event.timezone);
  const tracksById = new Map((event.tracks ?? []).map((t) => [t.id, t]));

  return (
    <main className="bg-surface-deep text-ink-primary">
      {/* PWA install banner. Sits as a sticky bottom card on phones, hides
          once the user installs or dismisses (7-day window), and is silent
          on the desktop unless the browser supports the install prompt.
          Surfaced here on the public event page because that is exactly
          the moment an attendee is engaging with Orkora for the first
          time and is most likely to want it on their home screen. */}
      <EventArrivalAnalytics slug={event.organization.slug ?? ''} />
      <InstallPrompt variant="banner" />

      <header className="relative isolate overflow-hidden bg-brand-gradient text-white">
        {event.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
        )}
        <div className="relative mx-auto max-w-5xl px-6 py-24">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-100">
            {event.organization.slug ? (
              <Link
                href={`/o/${event.organization.slug}`}
                className="underline-offset-4 transition hover:text-white hover:underline"
              >
                {event.organization.name}
              </Link>
            ) : (
              event.organization.name
            )}
          </p>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight sm:text-6xl">
            {event.title}
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-brand-50">
            {sameDay
              ? `${formatDay(start, event.timezone)} - ${formatTime(start, event.timezone)} to ${formatTime(end, event.timezone)}`
              : `${formatDay(start, event.timezone)} - ${formatDay(end, event.timezone)}`}{' '}
            ({event.timezone})
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {event.kind === 'physical'
                ? 'In person'
                : event.kind === 'virtual'
                  ? 'Virtual'
                  : 'Hybrid'}
            </span>
            <span className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-mono backdrop-blur">
              Code {event.code}
            </span>
            <Link
              href={`/e/${event.code}/register`}
              className="ml-auto rounded-full bg-white px-5 py-2 text-sm font-semibold text-brand-700 shadow hover:bg-brand-50"
            >
              Register
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-12 px-6 py-16">
        {event.description && (
          <section>
            <h2 className="mb-4 text-2xl font-bold text-ink-primary">About</h2>
            <p className="whitespace-pre-line text-ink-secondary">{event.description}</p>
          </section>
        )}

        {event.sessions && event.sessions.length > 0 && (
          <section>
            <h2 className="mb-6 text-2xl font-bold text-ink-primary">Agenda</h2>
            <div className="space-y-8">
              {groupSessionsByDay(event.sessions, event.timezone).map(([day, sessions]) => (
                <div key={day}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                    {formatDay(new Date(sessions[0]?.startAt ?? day), event.timezone)}
                  </h3>
                  <ul className="overflow-hidden rounded-xl border border-surface-border bg-surface shadow-glow">
                    {sessions.map((s, idx) => {
                      const track = s.trackId ? tracksById.get(s.trackId) : null;
                      return (
                        <li
                          key={s.id}
                          className={`flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:gap-6 ${idx > 0 ? 'border-t border-surface-border' : ''}`}
                        >
                          <span className="w-32 shrink-0 text-sm font-semibold text-brand-300">
                            {formatTime(new Date(s.startAt), event.timezone)} - {formatTime(new Date(s.endAt), event.timezone)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-ink-primary">{s.title}</p>
                            {s.description && (
                              <p className="mt-1 text-sm text-ink-secondary">{s.description}</p>
                            )}
                            {s.streamUrl &&
                            new Date(s.startAt) <= new Date() &&
                            new Date() <= new Date(s.endAt) ? (
                              <a
                                href={s.streamUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-3 py-1 text-xs font-bold text-white shadow-lg transition hover:bg-rose-600"
                              >
                                <span className="relative flex h-2 w-2">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                                </span>
                                Join live
                              </a>
                            ) : s.streamUrl ? (
                              <p className="mt-1 text-xs text-ink-muted">
                                Stream link will activate at session start.
                              </p>
                            ) : null}
                          </div>
                          {track && (
                            <span
                              className="self-start rounded-full px-2.5 py-0.5 text-xs font-medium"
                              style={{
                                backgroundColor: (track.color ?? '#EDE9FE') + '40',
                                color: track.color ?? '#5B21B6',
                              }}
                            >
                              {track.name}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {event.speakers && event.speakers.length > 0 && (
          <section>
            <h2 className="mb-6 text-2xl font-bold text-ink-primary">Speakers</h2>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
              {event.speakers.map((sp) => (
                <div key={sp.id} className="text-center">
                  <div className="mx-auto h-24 w-24 overflow-hidden rounded-full bg-surface-raised">
                    {sp.avatarUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sp.avatarUrl} alt={sp.fullName} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <p className="mt-3 font-semibold text-ink-primary">{sp.fullName}</p>
                  {sp.title && <p className="text-xs text-ink-secondary">{sp.title}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {event.tiers && event.tiers.length > 0 && (
          <section id="tickets">
            <h2 className="mb-6 text-2xl font-bold text-ink-primary">Tickets</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {event.tiers.map((tier) => {
                const remaining = tier.quantityTotal
                  ? Math.max(0, tier.quantityTotal - tier.quantitySold)
                  : null;
                const soldOut = remaining === 0;
                return (
                  <div key={tier.id} className="surface-card flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink-primary">{tier.name}</p>
                        {tier.isGroup && tier.groupSize && tier.groupSize > 1 && (
                          <span className="mt-0.5 inline-block rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-300">
                            Group of {tier.groupSize}+
                          </span>
                        )}
                        {tier.description && (
                          <p className="mt-0.5 text-sm text-ink-secondary">{tier.description}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-brand-500/10 px-3 py-1 text-sm font-bold text-brand-300">
                        {formatPrice(tier.priceMinor, tier.currency)}
                      </span>
                    </div>
                    {remaining !== null && (
                      <p className="text-xs text-ink-muted">
                        {soldOut ? 'Sold out' : `${remaining} remaining`}
                      </p>
                    )}
                    <Link
                      href={`/e/${event.code}/register?tier=${tier.id}`}
                      aria-disabled={soldOut}
                      className={`mt-auto inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                        soldOut
                          ? 'cursor-not-allowed bg-surface-raised text-ink-muted'
                          : 'bg-brand-500 text-white hover:bg-brand-600'
                      }`}
                    >
                      {soldOut ? 'Sold out' : 'Register'}
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {(event.status === 'live' || event.status === 'ended') && (
          <FeedbackForm
            code={event.code}
            sessions={(event.sessions ?? []).map((s) => ({ id: s.id, title: s.title }))}
          />
        )}
      </div>

      <footer className="mt-16 border-t border-surface-border bg-surface/40 py-8 text-center text-xs text-ink-muted">
        Powered by{' '}
        <Link href="/" className="font-semibold text-brand-300 hover:text-brand-200">
          Orkora
        </Link>
      </footer>
    </main>
  );
}
