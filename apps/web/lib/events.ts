import { apiFetch } from './auth';

export type EventKind = 'physical' | 'virtual' | 'hybrid';
export type EventStatus = 'draft' | 'published' | 'live' | 'ended' | 'archived';

// Topic categories for discovery/SEO. Must stay in sync with the API's
// EVENT_CATEGORIES list (apps/api/src/modules/events/dto/event.dto.ts).
export const EVENT_CATEGORIES: { slug: string; label: string }[] = [
  { slug: 'music', label: 'Music' },
  { slug: 'tech', label: 'Tech' },
  { slug: 'business', label: 'Business' },
  { slug: 'arts-culture', label: 'Arts & Culture' },
  { slug: 'food-drink', label: 'Food & Drink' },
  { slug: 'faith', label: 'Faith' },
  { slug: 'sports-fitness', label: 'Sports & Fitness' },
  { slug: 'wellness', label: 'Wellness' },
  { slug: 'education', label: 'Education' },
  { slug: 'community', label: 'Community' },
  { slug: 'fashion', label: 'Fashion' },
  { slug: 'comedy', label: 'Comedy' },
  { slug: 'film', label: 'Film' },
  { slug: 'other', label: 'Other' },
];

export function categoryLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return EVENT_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}

export interface OrganizerEventSummary {
  id: string;
  code: string;
  slug: string;
  title: string;
  kind: EventKind;
  startAt: string;
  endAt: string;
  timezone: string;
  status: EventStatus;
  bannerUrl: string | null;
  capacity: number | null;
  category: string | null;
  city: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventTier {
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

export interface EventTrack {
  id: string;
  name: string;
  color: string | null;
}

export interface EventSession {
  id: string;
  eventId: string;
  trackId: string | null;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  streamUrl: string | null;
  capacity: number | null;
  requiresRsvp: boolean;
}

export interface EventSpeaker {
  id: string;
  fullName: string;
  title: string | null;
  bio: string | null;
  avatarUrl: string | null;
  socialLinks: Record<string, string>;
}

export interface EventDetail extends OrganizerEventSummary {
  description: string | null;
  timezone: string;
  theme: Record<string, unknown>;
  organization: { name: string; logoUrl: string | null; brandColor: string | null };
  tracks: EventTrack[];
  sessions: EventSession[];
  speakers: EventSpeaker[];
  tiers: EventTier[];
  storyPublishedAt?: string | null;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  kind: EventKind;
  startAt: string;
  endAt: string;
  timezone?: string;
  capacity?: number;
  // `null` is accepted on update to clear an existing banner; the API treats
  // an absent value as "no change" and an explicit null as "remove".
  bannerUrl?: string | null;
  category?: string | null;
  city?: string | null;
}

export type UpdateEventInput = Partial<CreateEventInput>;

export const eventsApi = (orgId: string) => {
  const base = `/v1/organizations/${orgId}/events`;
  return {
    list: (status?: EventStatus) =>
      apiFetch<OrganizerEventSummary[]>(`${base}${status ? `?status=${status}` : ''}`),
    create: (input: CreateEventInput) =>
      apiFetch<OrganizerEventSummary>(base, { method: 'POST', json: input }),
    get: (eventId: string) => apiFetch<EventDetail>(`${base}/${eventId}`),
    update: (eventId: string, input: UpdateEventInput) =>
      apiFetch<OrganizerEventSummary>(`${base}/${eventId}`, { method: 'PATCH', json: input }),
    publish: (eventId: string) =>
      apiFetch<OrganizerEventSummary>(`${base}/${eventId}/publish`, { method: 'POST' }),
    unpublish: (eventId: string) =>
      apiFetch<OrganizerEventSummary>(`${base}/${eventId}/unpublish`, { method: 'POST' }),
    archive: (eventId: string) =>
      apiFetch<OrganizerEventSummary>(`${base}/${eventId}/archive`, { method: 'POST' }),
    remove: (eventId: string) =>
      apiFetch<{ ok: boolean }>(`${base}/${eventId}`, { method: 'DELETE' }),

    createSpeaker: (
      eventId: string,
      input: { fullName: string; title?: string; bio?: string; avatarUrl?: string | null },
    ) =>
      apiFetch<EventSpeaker>(`${base}/${eventId}/speakers`, {
        method: 'POST',
        json: input,
      }),
    updateSpeaker: (
      eventId: string,
      speakerId: string,
      input: { fullName?: string; title?: string; bio?: string; avatarUrl?: string | null },
    ) =>
      apiFetch<EventSpeaker>(`${base}/${eventId}/speakers/${speakerId}`, {
        method: 'PATCH',
        json: input,
      }),
    deleteSpeaker: (eventId: string, speakerId: string) =>
      apiFetch<{ ok: boolean }>(`${base}/${eventId}/speakers/${speakerId}`, {
        method: 'DELETE',
      }),

    listTracks: (eventId: string) => apiFetch<EventTrack[]>(`${base}/${eventId}/tracks`),
    createTrack: (eventId: string, input: { name: string; color?: string }) =>
      apiFetch<EventTrack>(`${base}/${eventId}/tracks`, { method: 'POST', json: input }),
    updateTrack: (eventId: string, trackId: string, input: { name?: string; color?: string }) =>
      apiFetch<EventTrack>(`${base}/${eventId}/tracks/${trackId}`, {
        method: 'PATCH',
        json: input,
      }),
    deleteTrack: (eventId: string, trackId: string) =>
      apiFetch<{ ok: boolean }>(`${base}/${eventId}/tracks/${trackId}`, {
        method: 'DELETE',
      }),

    createSession: (
      eventId: string,
      input: {
        title: string;
        description?: string;
        trackId?: string;
        startAt: string;
        endAt: string;
        streamUrl?: string;
        capacity?: number;
        requiresRsvp?: boolean;
      },
    ) =>
      apiFetch<EventSession>(`${base}/${eventId}/sessions`, { method: 'POST', json: input }),
    updateSession: (
      eventId: string,
      sessionId: string,
      input: Partial<{
        title: string;
        description: string;
        trackId: string | null;
        startAt: string;
        endAt: string;
        streamUrl: string | null;
        capacity: number | null;
        requiresRsvp: boolean;
      }>,
    ) =>
      apiFetch<EventSession>(`${base}/${eventId}/sessions/${sessionId}`, {
        method: 'PATCH',
        json: input,
      }),
    deleteSession: (eventId: string, sessionId: string) =>
      apiFetch<{ ok: boolean }>(`${base}/${eventId}/sessions/${sessionId}`, {
        method: 'DELETE',
      }),

    listTiers: (eventId: string) => apiFetch<EventTier[]>(`${base}/${eventId}/tiers`),
    createTier: (eventId: string, input: Partial<EventTier> & { name: string; priceMinor: number }) =>
      apiFetch<EventTier>(`${base}/${eventId}/tiers`, { method: 'POST', json: input }),
    updateTier: (eventId: string, tierId: string, input: Partial<EventTier>) =>
      apiFetch<EventTier>(`${base}/${eventId}/tiers/${tierId}`, { method: 'PATCH', json: input }),
    deleteTier: (eventId: string, tierId: string) =>
      apiFetch<{ ok: boolean }>(`${base}/${eventId}/tiers/${tierId}`, { method: 'DELETE' }),
  };
};

/**
 * Read the active org id from the access token's memberships claim. We pick
 * the first owner/admin/organizer membership we find.
 */
export function readActiveOrgId(): string | null {
  if (typeof window === 'undefined') return null;
  const token = sessionStorage.getItem('access_token');
  if (!token) return null;
  try {
    const [, body] = token.split('.');
    if (!body) return null;
    const payload = JSON.parse(
      atob(body.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { memberships?: Array<{ orgId: string; role: string }> };
    const ms = payload.memberships ?? [];
    const elevated = ms.find((m) =>
      ['owner', 'admin', 'organizer'].includes(m.role),
    );
    return (elevated ?? ms[0])?.orgId ?? null;
  } catch {
    return null;
  }
}

/**
 * Format a tier price for display. Treats price 0 as "Free" and falls back
 * to a `CCC 1,000.00` shape when the locale cannot map the currency.
 */
export function formatPrice(priceMinor: number, currency: string): string {
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

/**
 * "YYYY-MM-DD" for an instant rendered in `timeZone` (or the runtime's local
 * zone when omitted). Stable key for grouping/comparing by calendar day.
 */
export function dayKeyInTz(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** True when two instants fall on the same calendar day in `timeZone` (or local). */
export function sameCalendarDay(a: Date, b: Date, timeZone?: string): boolean {
  return dayKeyInTz(a, timeZone) === dayKeyInTz(b, timeZone);
}

/**
 * Offset of `timeZone` from UTC, in milliseconds, at a given absolute instant.
 * Positive for zones ahead of UTC (e.g. Africa/Lagos => +3_600_000).
 *
 * Works by formatting the instant in the target zone, reading the wall-clock
 * components back, and diffing against the same components interpreted as UTC.
 */
function tzOffsetMs(instantMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(instantMs));
  const get = (type: string): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  // Some engines emit hour "24" at midnight; normalise to 0.
  const hour = get('hour') === 24 ? 0 : get('hour');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );
  return asUtc - instantMs;
}

/**
 * Interpret a timezone-naive wall-clock string (what `<input type="datetime-local">`
 * produces, e.g. "2026-06-20T18:00") as a wall time IN `timeZone`, and return the
 * corresponding absolute instant as a UTC ISO string.
 *
 * `new Date(naive).toISOString()` interprets the string in the BROWSER's local
 * zone, which is wrong whenever the organizer is not physically in the event's
 * timezone. This resolves the zone's offset at that instant and corrects for it.
 */
export function wallTimeToUtcISO(naive: string, timeZone?: string): string {
  if (!naive) return '';
  const m = naive.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || !timeZone) {
    // Unexpected shape or no zone: fall back to browser-local parsing.
    return new Date(naive).toISOString();
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = m[6] ? Number(m[6]) : 0;
  const asUtcGuess = Date.UTC(y, mo - 1, d, h, mi, s);
  const offset = tzOffsetMs(asUtcGuess, timeZone);
  return new Date(asUtcGuess - offset).toISOString();
}

/**
 * Inverse of `wallTimeToUtcISO`: render a UTC ISO instant as the timezone-naive
 * wall-clock string (`YYYY-MM-DDTHH:mm`) that `<input type="datetime-local">`
 * expects, expressed in `timeZone` (the event's own zone). Used to pre-fill the
 * session edit form's date/time inputs so an organiser abroad sees the local
 * event time, not their browser's. Returns '' for an empty/invalid input.
 */
export function utcISOToWallTime(iso: string, timeZone?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  // Intl gives us the wall-clock parts in the target zone directly.
  const parts = new Intl.DateTimeFormat('en-CA', {
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  let hour = get('hour');
  // Intl can emit "24" for midnight in en-CA; normalise to "00".
  if (hour === '24') hour = '00';
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/**
 * "Mon, 12 Aug - 13 Aug 2026" or "Mon, 12 Aug 2026, 09:00 - 17:00" depending
 * on whether the event spans more than one day. When `timeZone` is supplied the
 * wall-clock times are rendered in that zone (the event's own timezone) rather
 * than the viewer's, so an organiser abroad still sees the local event time.
 */
export function formatEventDateRange(
  startISO: string,
  endISO: string,
  timeZone?: string,
): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const sameDay = sameCalendarDay(start, end, timeZone);
  const dayFmt: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  };
  const timeFmt: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  };
  if (sameDay) {
    return `${start.toLocaleDateString('en-GB', dayFmt)}, ${start.toLocaleTimeString('en-GB', timeFmt)} - ${end.toLocaleTimeString('en-GB', timeFmt)}`;
  }
  return `${start.toLocaleDateString('en-GB', dayFmt)} - ${end.toLocaleDateString('en-GB', dayFmt)}`;
}
