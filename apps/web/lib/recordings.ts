import { apiFetch } from './auth';

export type RecordingSource = 'link' | 'upload';
export type RecordingVisibility = 'public' | 'ticket' | 'tier';

/** Organizer-facing recording (full detail, includes url/storageKey). */
export interface Recording {
  id: string;
  eventId: string;
  sessionId: string | null;
  sessionTitle: string | null;
  title: string;
  description: string | null;
  source: RecordingSource;
  url: string | null;
  storageKey: string | null;
  durationSec: number | null;
  visibility: RecordingVisibility;
  requiredTierId: string | null;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
}

export interface CreateRecordingInput {
  sessionId?: string;
  title: string;
  description?: string;
  source: RecordingSource;
  url?: string;
  storageKey?: string;
  durationSec?: number;
  visibility: RecordingVisibility;
  requiredTierId?: string;
  publish?: boolean;
}

export type UpdateRecordingInput = Partial<CreateRecordingInput>;

/** Public listing metadata. Never exposes the url/storageKey for gated items. */
export interface PublicRecording {
  id: string;
  title: string;
  description: string | null;
  sessionTitle: string | null;
  visibility: RecordingVisibility;
  requiresTicket: boolean;
  durationSec: number | null;
}

/** Resolved playback payload returned after any gating check passes. */
export interface Playback {
  id: string;
  title: string;
  source: RecordingSource;
  durationSec: number | null;
  playbackUrl: string;
}

export const recordingsApi = (orgId: string) => {
  const base = `/v1/organizations/${orgId}/events`;
  return {
    list: (eventId: string) =>
      apiFetch<Recording[]>(`${base}/${eventId}/recordings`),
    create: (eventId: string, input: CreateRecordingInput) =>
      apiFetch<Recording>(`${base}/${eventId}/recordings`, {
        method: 'POST',
        json: input,
      }),
    update: (eventId: string, id: string, input: UpdateRecordingInput) =>
      apiFetch<Recording>(`${base}/${eventId}/recordings/${id}`, {
        method: 'PATCH',
        json: input,
      }),
    remove: (eventId: string, id: string) =>
      apiFetch<{ ok: boolean }>(`${base}/${eventId}/recordings/${id}`, {
        method: 'DELETE',
      }),
  };
};

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

/** Public: list published recordings for an event by its public code. */
export async function listPublicRecordings(
  eventCode: string,
): Promise<PublicRecording[]> {
  const res = await fetch(`${apiBase()}/v1/events/${eventCode}/recordings`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error('Could not load recordings for this event.');
  }
  return (await res.json()) as PublicRecording[];
}

/**
 * Public: resolve a playback URL. The ticket code (when needed) is sent in the
 * POST body so it never lands in a URL or an access log. A 403 surfaces the
 * server's message so the caller can prompt for a ticket and retry.
 */
export async function playRecording(
  eventCode: string,
  recordingId: string,
  ticketCode?: string,
): Promise<Playback> {
  const res = await fetch(
    `${apiBase()}/v1/events/${eventCode}/recordings/${recordingId}/play`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticketCode ? { ticketCode } : {}),
    },
  );
  if (!res.ok) {
    let message = 'This recording is not available.';
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(' ');
      else if (body.message) message = body.message;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }
  return (await res.json()) as Playback;
}

/** Format a duration in seconds as "M:SS" or "H:MM:SS". */
export function formatDuration(durationSec: number | null): string | null {
  if (durationSec == null || durationSec <= 0) return null;
  const h = Math.floor(durationSec / 3600);
  const m = Math.floor((durationSec % 3600) / 60);
  const s = Math.floor(durationSec % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
