import { apiFetch } from './auth';

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

export interface Poll {
  id: string;
  sessionId: string;
  session: { id: string; title: string } | null;
  question: string;
  options: PollOption[];
  status: string;
  multiSelect: boolean;
  closedAt: string | null;
  totalVotes: number;
}

export interface QaQuestion {
  id: string;
  channelId: string;
  body: string;
  createdAt: string;
  answeredAt: string | null;
  hidden: boolean;
  upvotes: number;
  authorName: string | null;
}

export interface CreatePollInput {
  sessionId: string;
  question: string;
  options: string[];
  multiSelect?: boolean;
}

/**
 * Organizer-side live engagement API (polls + Q&A moderation). Route paths
 * mirror the NestJS controllers under organizations/:orgId/events/:eventId.
 */
export const engagementApi = (orgId: string) => {
  const base = `/v1/organizations/${orgId}/events`;
  return {
    listPolls: (eventId: string) => apiFetch<Poll[]>(`${base}/${eventId}/polls`),
    createPoll: (eventId: string, input: CreatePollInput) =>
      apiFetch<Poll>(`${base}/${eventId}/polls`, { method: 'POST', json: input }),
    closePoll: (eventId: string, pollId: string) =>
      apiFetch<Poll>(`${base}/${eventId}/polls/${pollId}/close`, { method: 'POST' }),

    listQuestionsOrganizer: (eventId: string) =>
      apiFetch<QaQuestion[]>(`${base}/${eventId}/qa`),
    setQuestionAnswered: (eventId: string, questionId: string, answered: boolean) =>
      apiFetch<{ id: string; answeredAt: string | null }>(
        `${base}/${eventId}/qa/${questionId}/answered`,
        { method: 'PATCH', json: { answered } },
      ),
    setQuestionHidden: (eventId: string, questionId: string, hidden: boolean) =>
      apiFetch<{ id: string; hidden: boolean }>(
        `${base}/${eventId}/qa/${questionId}/hidden`,
        { method: 'PATCH', json: { hidden } },
      ),

    // Live "on screen now" spotlight.
    getSpotlight: (eventId: string) =>
      apiFetch<Spotlight | null>(`/v1/events/${eventId}/engagement/spotlight`),
    setSpotlight: (eventId: string, input: SpotlightInput) =>
      apiFetch<Spotlight>(`${base}/${eventId}/spotlight`, { method: 'POST', json: input }),
    clearSpotlight: (eventId: string) =>
      apiFetch<{ ok: boolean }>(`${base}/${eventId}/spotlight`, { method: 'DELETE' }),

    // Chat moderation.
    listChat: (eventId: string) =>
      apiFetch<ChatMessageMod[]>(`${base}/${eventId}/chat`),
    deleteChatMessage: (eventId: string, messageId: string) =>
      apiFetch<{ id: string }>(`${base}/${eventId}/chat/${messageId}`, { method: 'DELETE' }),
  };
};

export interface ChatMessageMod {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string | null;
}

export type SpotlightKind = 'announcement' | 'link' | 'video';

export interface SpotlightInput {
  kind: SpotlightKind;
  title?: string;
  body?: string;
  url?: string;
}

export interface Spotlight {
  kind: SpotlightKind;
  title: string | null;
  body: string | null;
  url: string | null;
  active: boolean;
  updatedAt: string;
}
