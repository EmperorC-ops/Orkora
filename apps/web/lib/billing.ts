import { apiFetch } from './auth';

export interface BillingOverview {
  organization: {
    id: string;
    name: string;
    plan: string;
    createdAt: string;
    countryCode: string;
  };
  plan: {
    name: string;
    platformFeeBps: number;
    platformFeePercent: number;
    notes: string[];
  };
  lifetime: {
    revenue: Array<{ currency: string; totalMinor: string }>;
    notionalFee: Array<{ currency: string; totalMinor: string }>;
    refunds: Array<{ currency: string; totalMinor: string }>;
    paidOrderCount: number;
    refundedOrderCount: number;
  };
}

export interface Trailing12Row {
  month: string;
  currency: string;
  totalMinor: string;
}

export function billingApi(orgId: string) {
  const base = `/v1/organizations/${orgId}/billing`;
  return {
    overview: () => apiFetch<BillingOverview>(`${base}/overview`),
    trailing12: () => apiFetch<Trailing12Row[]>(`${base}/trailing-12`),
    csvUrl: () => {
      const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
      return `${api}${base}/orders.csv`;
    },
  };
}

export function formatMinor(minor: string, currency: string): string {
  const n = Number(minor) / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
}
