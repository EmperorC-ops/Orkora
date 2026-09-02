import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const BASE_URL =
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'http://localhost:4000';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface ApiOptions {
  method?: HttpMethod;
  body?: unknown;
  auth?: boolean;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (auth) {
    const token = await SecureStore.getItemAsync('access_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ApiError(res.status, detail || res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface PublicTier {
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

export interface PublicTrack {
  id: string;
  name: string;
  color: string | null;
}

export interface PublicSession {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  trackId: string | null;
}

export interface PublicSpeaker {
  id: string;
  fullName: string;
  title: string | null;
  bio: string | null;
  avatarUrl: string | null;
  socialLinks: Record<string, string>;
}

export interface PublicEvent {
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
  organization: { name: string; logoUrl?: string | null; brandColor: string | null; slug?: string };
  tracks?: PublicTrack[];
  sessions?: PublicSession[];
  speakers?: PublicSpeaker[];
  tiers?: PublicTier[];
}

export const eventsApi = {
  findByCode: (code: string) =>
    api<PublicEvent>(`/v1/events/by-code/${encodeURIComponent(code)}`, { auth: false }),
  findBySlug: (orgSlug: string, eventSlug: string) =>
    api<PublicEvent>(
      `/v1/events/by-slug/${encodeURIComponent(orgSlug)}/${encodeURIComponent(eventSlug)}`,
      { auth: false },
    ),
};

export interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function persistTokens(t: TokenBundle): Promise<void> {
  await SecureStore.setItemAsync('access_token', t.accessToken);
  await SecureStore.setItemAsync('refresh_token', t.refreshToken);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync('access_token').catch(() => {});
  await SecureStore.deleteItemAsync('refresh_token').catch(() => {});
}

// ===== Registration =====

export type PaymentMethod = 'free' | 'stripe' | 'paystack' | 'flutterwave';

export interface AttendeeInput {
  fullName: string;
  email: string;
  phone?: string;
}

export interface RegisterAttendeesInput {
  tierId: string;
  attendees: AttendeeInput[];
  paymentMethod?: PaymentMethod;
  formResponses?: Record<string, unknown>;
}

export interface IssuedTicket {
  id: string;
  code: string;
  holderName: string;
  holderEmail: string;
  status: string;
  tierName: string;
  qrToken: string;
}

export interface OrderSummary {
  id: string;
  status: string;
  currency: string;
  totalMinor: number;
  provider: string | null;
  checkoutUrl: string | null;
}

export interface RegistrationResult {
  registrationId: string;
  status: string;
  userId: string;
  eventId: string;
  eventCode: string;
  tickets: IssuedTicket[];
  order: OrderSummary | null;
}

export interface PublicTicket {
  id: string;
  code: string;
  holderName: string;
  holderEmail: string;
  status: string;
  issuedAt: string;
  checkedInAt: string | null;
  tier: { id: string; name: string };
  event: {
    id: string;
    title: string;
    code: string;
    startAt: string;
    endAt: string;
    bannerUrl: string | null;
    timezone: string;
  };
  registrationId: string;
  qrToken: string;
}

export const registrationApi = {
  register: (eventCode: string, input: RegisterAttendeesInput) =>
    api<RegistrationResult>(`/v1/events/by-code/${encodeURIComponent(eventCode)}/register`, {
      method: 'POST',
      body: input,
      auth: false,
    }),
  getTicket: (code: string) =>
    api<PublicTicket>(`/v1/tickets/by-code/${encodeURIComponent(code)}`, {
      auth: false,
    }),
  myTickets: () => api<PublicTicket[]>('/v1/me/tickets'),
};

export const authApi = {
  // POST /v1/auth/signup is non-enumerating and does NOT return a session:
  // it responds 202 with { status, destination } and emails a code. The
  // session comes from exchangeOtp below once the user enters it. Typing this
  // as TokenBundle was wrong and would silently hand a caller an object with
  // no accessToken on it.
  signup: (input: { email: string; password: string; fullName: string; phone?: string }) =>
    api<{ status: 'verification_sent'; destination: string }>('/v1/auth/signup', {
      method: 'POST',
      body: input,
      auth: false,
    }),
  login: (input: { email: string; password: string }) =>
    api<TokenBundle>('/v1/auth/login', { method: 'POST', body: input, auth: false }),
  social: (input: { provider: 'google' | 'apple'; idToken: string }) =>
    api<TokenBundle>('/v1/auth/social', { method: 'POST', body: input, auth: false }),
  sendOtp: (input: {
    channel: 'email' | 'sms';
    destination: string;
    purpose: 'signup' | 'login' | 'payment_confirm' | 'phone_verify';
  }) =>
    api<{ expiresAt: string }>('/v1/auth/otp/send', {
      method: 'POST',
      body: input,
      auth: false,
    }),
  verifyOtp: (input: { destination: string; code: string; purpose: string }) =>
    api<{ verified: boolean }>('/v1/auth/otp/verify', {
      method: 'POST',
      body: input,
      auth: false,
    }),
  /**
   * Verify a code and receive a session in one round trip. This is what
   * completes both signup and passwordless login; `verifyOtp` above only
   * checks a code and issues nothing. Only `signup` and `login` purposes are
   * accepted by the API; `payment_confirm` and `phone_verify` are rejected.
   */
  exchangeOtp: (input: {
    destination: string;
    code: string;
    purpose: 'signup' | 'login';
  }) =>
    api<TokenBundle>('/v1/auth/otp/exchange', {
      method: 'POST',
      body: input,
      auth: false,
    }),
  logout: () => api<void>('/v1/auth/logout', { method: 'POST' }),
};
