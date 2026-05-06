/**
 * Public registration helpers used by web pages. These do not need auth.
 * The auth helper file already exports apiFetch and ApiError; we reuse those.
 */
import { apiFetch } from './auth';

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
    apiFetch<RegistrationResult>(
      `/v1/events/by-code/${encodeURIComponent(eventCode)}/register`,
      { method: 'POST', json: input, auth: false },
    ),
  getTicket: (code: string) =>
    apiFetch<PublicTicket>(`/v1/tickets/by-code/${encodeURIComponent(code)}`, {
      method: 'GET',
      auth: false,
    }),
  myTickets: () => apiFetch<PublicTicket[]>('/v1/me/tickets', { method: 'GET' }),
};

export interface OrderStatusView {
  id: string;
  status: string;
  currency: string;
  totalMinor: number;
  provider: string | null;
  paidAt: string | null;
  event: { title: string; code: string } | null;
  tickets: Array<{
    id: string;
    code: string;
    holderName: string;
    status: string;
    tier: { name: string };
  }>;
}

export const paymentsApi = {
  methods: (currency?: string) =>
    apiFetch<{ methods: string[]; recommended: string | null }>(
      `/v1/payments/methods${currency ? `?currency=${encodeURIComponent(currency)}` : ''}`,
      { method: 'GET', auth: false },
    ),
  startCheckout: (orderId: string) =>
    apiFetch<{ url: string; provider: string }>(
      `/v1/payments/orders/${encodeURIComponent(orderId)}/checkout`,
      { method: 'POST', auth: false },
    ),
  getOrder: (orderId: string) =>
    apiFetch<OrderStatusView>(`/v1/payments/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      auth: false,
    }),
};

/**
 * Format a minor-units amount as a localised currency string. We use Intl with
 * a locale derived from the currency code. Minor units => major units uses 100
 * for every currency we currently support (NGN, USD, KES, GHS, ZAR).
 */
export function formatMoney(minor: number, currency: string): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(0)}`;
  }
}

export function formatEventDates(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const dayFmt = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (start.toDateString() === end.toDateString()) {
    return `${dayFmt.format(start)}, ${timeFmt.format(start)} to ${timeFmt.format(end)}`;
  }
  return `${dayFmt.format(start)} to ${dayFmt.format(end)}`;
}
