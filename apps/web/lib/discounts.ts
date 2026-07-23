import { apiFetch } from './auth';

export type DiscountKind = 'percent' | 'fixed';

export interface DiscountCode {
  id: string;
  eventId: string;
  code: string;
  kind: DiscountKind;
  value: number;
  currency: string | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  redemptionsRemaining: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  createdAt: string;
}

export interface CreateDiscountInput {
  code: string;
  kind: DiscountKind;
  value: number;
  currency?: string;
  maxRedemptions?: number;
  startsAt?: string;
  endsAt?: string;
  active?: boolean;
}

export type UpdateDiscountInput = Partial<CreateDiscountInput>;

export interface DiscountValidation {
  valid: true;
  kind: DiscountKind;
  value: number;
  discountMinor: number;
  subtotalMinor: number;
  totalMinor: number;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Organizer-facing discount code API, scoped to an org + event. Mirrors the
 * shape of `eventsApi` in ./events.
 */
export const discountsApi = (orgId: string) => {
  const base = `/v1/organizations/${orgId}/events`;
  return {
    listCodes: (eventId: string) =>
      apiFetch<DiscountCode[]>(`${base}/${eventId}/discounts`),
    createCode: (eventId: string, input: CreateDiscountInput) =>
      apiFetch<DiscountCode>(`${base}/${eventId}/discounts`, {
        method: 'POST',
        json: input,
      }),
    updateCode: (eventId: string, codeId: string, input: UpdateDiscountInput) =>
      apiFetch<DiscountCode>(`${base}/${eventId}/discounts/${codeId}`, {
        method: 'PATCH',
        json: input,
      }),
    deleteCode: (eventId: string, codeId: string) =>
      apiFetch<{ ok: boolean }>(`${base}/${eventId}/discounts/${codeId}`, {
        method: 'DELETE',
      }),
  };
};

/**
 * Public, unauthenticated validation used by the register page. Hits the
 * throttled `/v1/events/:code/discounts/validate` endpoint with a plain fetch
 * (no auth token). Throws an Error whose message is the API's friendly reason
 * so the caller can surface it directly.
 */
export async function validateDiscount(
  eventCode: string,
  input: { code: string; tierId: string; quantity: number },
): Promise<DiscountValidation> {
  const res = await fetch(
    `${API}/v1/events/${encodeURIComponent(eventCode)}/discounts/validate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) {
    let message = 'That discount code is not valid.';
    try {
      const body = (await res.json()) as { detail?: string; message?: string };
      message = body.detail ?? body.message ?? message;
    } catch {
      // Non-JSON body: keep the default message.
    }
    throw new Error(message);
  }
  return (await res.json()) as DiscountValidation;
}
