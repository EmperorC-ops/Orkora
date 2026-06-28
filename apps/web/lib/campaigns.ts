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
    get: (id: string) => apiFetch<CampaignSummary>(`${base}/campaigns/${id}`),
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
    }) =>
      apiFetch<CampaignSummary>(`${base}/campaigns`, {
        method: 'POST',
        json: input,
      }),
    patch: (id: string, patch: Partial<{ name: string; subject: string; previewText: string; bodyMarkdown: string; fromName: string; fromEmail: string; replyTo: string; audienceId: string }>) =>
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
