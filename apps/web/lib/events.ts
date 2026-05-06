import { apiFetch } from './auth';

export type EventKind = 'physical' | 'virtual' | 'hybrid';
export type EventStatus = 'draft' | 'published' | 'live' | 'ended' | 'archived';

export interface OrganizerEventSummary {
  id: string;
  code: string;
  slug: string;
  title: string;
  kind: EventKind;
  startAt: string;
  endAt: string;
  status: EventStatus;
  bannerUrl: string | null;
  capacity: number | null;
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
}

export interface CreateEventInput {
  title: string;
  description?: string;
  kind: EventKind;
  startAt: string;
  endAt: string;
  timezone?: string;
  capacity?: number;
  bannerUrl?: string;
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
    deleteSpeaker: (eventId: string, speakerId: string) =>
      apiFetch<{ ok: boolean }>(`${base}/${eventId}/speakers/${speakerId}`, {
        method: 'DELETE',
      }),

    listTracks: (eventId: string) => apiFetch<EventTrack[]>(`${base}/${eventId}/tracks`),
    createTrack: (eventId: string, input: { name: string; color?: string }) =>
      apiFetch<EventTrack>(`${base}/${eventId}/tracks`, { method: 'POST', json: input }),
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
 * "Mon, 12 Aug - 13 Aug 2026" or "Mon, 12 Aug 2026, 09:00 - 17:00" depending
 * on whether the event spans more than one day.
 */
export function formatEventDateRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const sameDay = start.toDateString() === end.toDateString();
  const dayFmt: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  if (sameDay) {
    return `${start.toLocaleDateString('en-GB', dayFmt)}, ${start.toLocaleTimeString('en-GB', timeFmt)} - ${end.toLocaleTimeString('en-GB', timeFmt)}`;
  }
  return `${start.toLocaleDateString('en-GB', dayFmt)} - ${end.toLocaleDateString('en-GB', dayFmt)}`;
}
