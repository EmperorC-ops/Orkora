import {
  CreateEventInput,
  CreateSessionInput,
  CreateSpeakerInput,
  CreateTicketTierInput,
  CreateTrackInput,
  EventStatus,
  LoginInput,
  OrganizerEventSummary,
  PublicEvent,
  PublicEventSpeaker,
  PublicEventTier,
  PublicEventTrack,
  CheckoutSessionResponse,
  OrderStatusView,
  PaymentMethodsResponse,
  PublicTicket,
  RegisterAttendeesInput,
  RegistrationResult,
  RegistrationRow,
  ReorderTiersInput,
  SendOtpInput,
  SignupInput,
  SocialLoginInput,
  TokenBundle,
  UpdateEventInput,
  UpdateSessionInput,
  UpdateTicketTierInput,
  VerifyOtpInput,
} from '@orkora/contracts';
import { z } from 'zod';

const OtpSendResponse = z.object({ expiresAt: z.string() });
const OtpVerifyResponse = z.object({ verified: z.boolean() });
const OkResponse = z.object({ ok: z.boolean() });

const PublicSession = z.object({
  id: z.string(),
  eventId: z.string(),
  trackId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  streamUrl: z.string().nullable(),
  capacity: z.number().int().nullable(),
  requiresRsvp: z.boolean(),
});

export interface SdkOptions {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null> | string | null;
  fetchImpl?: typeof fetch;
  /** Optional org id, set as X-Organization-Id on every authenticated request. */
  getActiveOrgId?: () => string | null;
}

export class OrkoraClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: SdkOptions['getAccessToken'];
  private readonly getActiveOrgId?: SdkOptions['getActiveOrgId'];
  private readonly fetchImpl: typeof fetch;

  constructor(opts: SdkOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.getAccessToken = opts.getAccessToken;
    this.getActiveOrgId = opts.getActiveOrgId;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  auth = {
    signup: (input: SignupInput): Promise<TokenBundle> =>
      this.request('/v1/auth/signup', { method: 'POST', body: input, schema: TokenBundle, auth: false }),
    login: (input: LoginInput): Promise<TokenBundle> =>
      this.request('/v1/auth/login', { method: 'POST', body: input, schema: TokenBundle, auth: false }),
    social: (input: SocialLoginInput): Promise<TokenBundle> =>
      this.request('/v1/auth/social', { method: 'POST', body: input, schema: TokenBundle, auth: false }),
    refresh: (refreshToken: string): Promise<TokenBundle> =>
      this.request('/v1/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        schema: TokenBundle,
        auth: false,
      }),
    logout: (): Promise<void> =>
      this.requestVoid('/v1/auth/logout', { method: 'POST' }),
    sendOtp: (input: SendOtpInput): Promise<{ expiresAt: string }> =>
      this.request('/v1/auth/otp/send', {
        method: 'POST',
        body: input,
        schema: OtpSendResponse,
        auth: false,
      }),
    verifyOtp: (input: VerifyOtpInput): Promise<{ verified: boolean }> =>
      this.request('/v1/auth/otp/verify', {
        method: 'POST',
        body: input,
        schema: OtpVerifyResponse,
        auth: false,
      }),
  };

  /** Public event reads (no auth, no org context required). */
  events = {
    findByCode: (code: string): Promise<PublicEvent> =>
      this.request(`/v1/events/by-code/${encodeURIComponent(code)}`, {
        method: 'GET',
        schema: PublicEvent,
        auth: false,
      }),
    findBySlug: (orgSlug: string, eventSlug: string): Promise<PublicEvent> =>
      this.request(
        `/v1/events/by-slug/${encodeURIComponent(orgSlug)}/${encodeURIComponent(eventSlug)}`,
        { method: 'GET', schema: PublicEvent, auth: false },
      ),
  };

  /** Public payments helpers used by the register / confirm pages. */
  payments = {
    methods: (currency?: string): Promise<PaymentMethodsResponse> =>
      this.request(
        `/v1/payments/methods${currency ? `?currency=${encodeURIComponent(currency)}` : ''}`,
        { method: 'GET', schema: PaymentMethodsResponse, auth: false },
      ),
    startCheckout: (orderId: string): Promise<CheckoutSessionResponse> =>
      this.request(`/v1/payments/orders/${encodeURIComponent(orderId)}/checkout`, {
        method: 'POST',
        schema: CheckoutSessionResponse,
        auth: false,
      }),
    getOrder: (orderId: string): Promise<OrderStatusView> =>
      this.request(`/v1/payments/orders/${encodeURIComponent(orderId)}`, {
        method: 'GET',
        schema: OrderStatusView,
        auth: false,
      }),
  };

  /** Public registration + ticket reads. */
  registration = {
    register: (eventCode: string, input: RegisterAttendeesInput): Promise<RegistrationResult> =>
      this.request(`/v1/events/by-code/${encodeURIComponent(eventCode)}/register`, {
        method: 'POST',
        body: input,
        schema: RegistrationResult,
        auth: false,
      }),
    getTicket: (code: string): Promise<PublicTicket> =>
      this.request(`/v1/tickets/by-code/${encodeURIComponent(code)}`, {
        method: 'GET',
        schema: PublicTicket,
        auth: false,
      }),
    myTickets: (): Promise<PublicTicket[]> =>
      this.request('/v1/me/tickets', {
        method: 'GET',
        schema: z.array(PublicTicket),
      }),
  };

  /**
   * Organizer-side endpoints. `org(orgId)` returns a sub-client bound to a
   * specific organization. All requests carry both Bearer auth and the org id
   * as a route param.
   */
  org(orgId: string) {
    const base = `/v1/organizations/${encodeURIComponent(orgId)}/events`;
    return {
      list: (status?: EventStatus): Promise<OrganizerEventSummary[]> =>
        this.request(`${base}${status ? `?status=${status}` : ''}`, {
          method: 'GET',
          schema: z.array(OrganizerEventSummary),
        }),
      create: (input: CreateEventInput): Promise<OrganizerEventSummary> =>
        this.request(base, { method: 'POST', body: input, schema: OrganizerEventSummary }),
      get: (eventId: string): Promise<PublicEvent> =>
        this.request(`${base}/${eventId}`, { method: 'GET', schema: PublicEvent }),
      update: (eventId: string, input: UpdateEventInput): Promise<OrganizerEventSummary> =>
        this.request(`${base}/${eventId}`, {
          method: 'PATCH',
          body: input,
          schema: OrganizerEventSummary,
        }),
      publish: (eventId: string): Promise<OrganizerEventSummary> =>
        this.request(`${base}/${eventId}/publish`, {
          method: 'POST',
          schema: OrganizerEventSummary,
        }),
      unpublish: (eventId: string): Promise<OrganizerEventSummary> =>
        this.request(`${base}/${eventId}/unpublish`, {
          method: 'POST',
          schema: OrganizerEventSummary,
        }),
      archive: (eventId: string): Promise<OrganizerEventSummary> =>
        this.request(`${base}/${eventId}/archive`, {
          method: 'POST',
          schema: OrganizerEventSummary,
        }),
      remove: (eventId: string): Promise<{ ok: boolean }> =>
        this.request(`${base}/${eventId}`, { method: 'DELETE', schema: OkResponse }),

      tracks: {
        list: (eventId: string): Promise<PublicEventTrack[]> =>
          this.request(`${base}/${eventId}/tracks`, {
            method: 'GET',
            schema: z.array(PublicEventTrack),
          }),
        create: (eventId: string, input: CreateTrackInput): Promise<PublicEventTrack> =>
          this.request(`${base}/${eventId}/tracks`, {
            method: 'POST',
            body: input,
            schema: PublicEventTrack,
          }),
        remove: (eventId: string, trackId: string): Promise<{ ok: boolean }> =>
          this.request(`${base}/${eventId}/tracks/${trackId}`, {
            method: 'DELETE',
            schema: OkResponse,
          }),
      },

      sessions: {
        create: (eventId: string, input: CreateSessionInput) =>
          this.request(`${base}/${eventId}/sessions`, {
            method: 'POST',
            body: input,
            schema: PublicSession,
          }),
        update: (eventId: string, sessionId: string, input: UpdateSessionInput) =>
          this.request(`${base}/${eventId}/sessions/${sessionId}`, {
            method: 'PATCH',
            body: input,
            schema: PublicSession,
          }),
        remove: (eventId: string, sessionId: string): Promise<{ ok: boolean }> =>
          this.request(`${base}/${eventId}/sessions/${sessionId}`, {
            method: 'DELETE',
            schema: OkResponse,
          }),
      },

      speakers: {
        list: (eventId: string): Promise<PublicEventSpeaker[]> =>
          this.request(`${base}/${eventId}/speakers`, {
            method: 'GET',
            schema: z.array(PublicEventSpeaker),
          }),
        create: (eventId: string, input: CreateSpeakerInput): Promise<PublicEventSpeaker> =>
          this.request(`${base}/${eventId}/speakers`, {
            method: 'POST',
            body: input,
            schema: PublicEventSpeaker,
          }),
        remove: (eventId: string, speakerId: string): Promise<{ ok: boolean }> =>
          this.request(`${base}/${eventId}/speakers/${speakerId}`, {
            method: 'DELETE',
            schema: OkResponse,
          }),
      },

      tiers: {
        list: (eventId: string): Promise<PublicEventTier[]> =>
          this.request(`${base}/${eventId}/tiers`, {
            method: 'GET',
            schema: z.array(PublicEventTier),
          }),
        create: (eventId: string, input: CreateTicketTierInput): Promise<PublicEventTier> =>
          this.request(`${base}/${eventId}/tiers`, {
            method: 'POST',
            body: input,
            schema: PublicEventTier,
          }),
        update: (
          eventId: string,
          tierId: string,
          input: UpdateTicketTierInput,
        ): Promise<PublicEventTier> =>
          this.request(`${base}/${eventId}/tiers/${tierId}`, {
            method: 'PATCH',
            body: input,
            schema: PublicEventTier,
          }),
        remove: (eventId: string, tierId: string): Promise<{ ok: boolean }> =>
          this.request(`${base}/${eventId}/tiers/${tierId}`, {
            method: 'DELETE',
            schema: OkResponse,
          }),
        reorder: (eventId: string, input: ReorderTiersInput): Promise<PublicEventTier[]> =>
          this.request(`${base}/${eventId}/tiers/reorder`, {
            method: 'PUT',
            body: input,
            schema: z.array(PublicEventTier),
          }),
      },

      registrations: {
        list: (
          eventId: string,
          query?: { status?: string; q?: string },
        ): Promise<RegistrationRow[]> => {
          const qs = new URLSearchParams();
          if (query?.status) qs.set('status', query.status);
          if (query?.q) qs.set('q', query.q);
          const suffix = qs.toString() ? `?${qs.toString()}` : '';
          return this.request(`${base}/${eventId}/registrations${suffix}`, {
            method: 'GET',
            schema: z.array(RegistrationRow),
          });
        },
      },
    };
  }

  // ---- internal ----

  private async request<T>(
    path: string,
    opts: {
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
      body?: unknown;
      schema: { parse: (data: unknown) => T };
      auth?: boolean;
    },
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (opts.auth !== false && this.getAccessToken) {
      const token = await this.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (this.getActiveOrgId) {
      const orgId = this.getActiveOrgId();
      if (orgId) headers['X-Organization-Id'] = orgId;
    }
    const res = await this.fetchImpl(this.baseUrl + path, {
      method: opts.method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new OrkoraError(res.status, body);
    }
    return opts.schema.parse(await res.json());
  }

  private async requestVoid(
    path: string,
    opts: { method: 'POST' | 'DELETE'; auth?: boolean },
  ): Promise<void> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.auth !== false && this.getAccessToken) {
      const token = await this.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const res = await this.fetchImpl(this.baseUrl + path, {
      method: opts.method,
      headers,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new OrkoraError(res.status, body);
    }
  }
}

export class OrkoraError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OrkoraError';
  }
}

export * from '@orkora/contracts';
