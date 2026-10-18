import { apiFetch } from './auth';

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'cancelled'
  | 'failed';

export interface CampaignSummary {
  id: string;
  name: string;
  subject: string;
  status: CampaignStatus;
  sendMode: 'now' | 'scheduled' | 'triggered';
  scheduledAt: string | null;
  recipientCount: number;
  sentStartedAt: string | null;
  sentCompletedAt: string | null;
  createdAt: string;
  audience: { id: string; name: string; cachedCount: number } | null;
}

/** Full campaign as returned by GET /campaigns/:id, used to edit a draft. */
export interface CampaignDetail extends CampaignSummary {
  previewText: string | null;
  bodyMarkdown: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  eventId: string | null;
  audienceId: string;
  flyerUrl: string | null;
}

export interface AudienceSummary {
  id: string;
  name: string;
  kind: 'smart' | 'custom';
  smartKey: string | null;
  eventId: string | null;
  cachedCount: number;
  cachedAt: string | null;
}

export function campaignsApi(orgId: string) {
  const base = `/v1/organizations/${orgId}`;
  return {
    list: () => apiFetch<CampaignSummary[]>(`${base}/campaigns`),
    get: (id: string) => apiFetch<CampaignDetail>(`${base}/campaigns/${id}`),
    /** Delete a draft. The API refuses anything that is not a draft. */
    remove: (id: string) =>
      apiFetch<void>(`${base}/campaigns/${id}`, {
        method: 'DELETE',
      }),
    create: (input: {
      name: string;
      subject: string;
      previewText?: string;
      bodyMarkdown: string;
      fromName: string;
      fromEmail: string;
      replyTo?: string;
      audienceId: string;
      eventId?: string;
      /** Optional inline flyer image URL from the campaign_flyer upload flow. */
      flyerUrl?: string;
    }) =>
      apiFetch<CampaignSummary>(`${base}/campaigns`, {
        method: 'POST',
        json: input,
      }),
    patch: (id: string, patch: Partial<{ name: string; subject: string; previewText: string; bodyMarkdown: string; fromName: string; fromEmail: string; replyTo: string; audienceId: string; eventId: string; flyerUrl: string | null }>) =>
      apiFetch<CampaignSummary>(`${base}/campaigns/${id}`, {
        method: 'PATCH',
        json: patch,
      }),
    send: (id: string) =>
      apiFetch<{ recipientCount: number }>(`${base}/campaigns/${id}/send`, {
        method: 'POST',
      }),
    testSend: (id: string, email: string) =>
      apiFetch<void>(`${base}/campaigns/${id}/test-send`, {
        method: 'POST',
        json: { email },
      }),

    listAudiences: () => apiFetch<AudienceSummary[]>(`${base}/audiences`),
    createAudience: (input: {
      name: string;
      kind: 'smart' | 'custom';
      smartKey?: string;
      eventId?: string;
    }) =>
      apiFetch<AudienceSummary>(`${base}/audiences`, {
        method: 'POST',
        json: input,
      }),
  };
}
