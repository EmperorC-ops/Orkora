import { apiFetch } from './auth';

export type PlatformRole = 'none' | 'support' | 'superadmin';

export interface Paged<T> {
  total: number;
  take: number;
  skip: number;
  rows: T[];
}

export interface PlatformOverview {
  organizations: { total: number; suspended: number; active: number };
  users: { total: number; superAdmins: number };
  events: { total: number; published: number };
  registrations: number;
  ticketsIssued: number;
  paidOrders: number;
  revenueByCurrency: Record<string, number>;
}

export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  countryCode: string;
  createdAt: string;
  eventCount: number;
  memberCount: number;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  platformRole: PlatformRole;
  createdAt: string;
  lastLoginAt: string | null;
  membershipCount: number;
  registrationCount: number;
}

export interface AdminEvent {
  id: string;
  code: string;
  title: string;
  slug: string;
  status: string;
  startAt: string;
  timezone: string;
  createdAt: string;
  organization: { id: string; name: string; slug: string };
  registrationCount: number;
}

/**
 * Read the platform role from the access token's `platformRole` claim. Mirrors
 * `readActiveOrgId` in lib/events. Returns 'none' when unauthenticated.
 */
export function readPlatformRole(): PlatformRole {
  if (typeof window === 'undefined') return 'none';
  const token = sessionStorage.getItem('access_token');
  if (!token) return 'none';
  try {
    const [, body] = token.split('.');
    if (!body) return 'none';
    const payload = JSON.parse(
      atob(body.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { platformRole?: PlatformRole };
    return payload.platformRole ?? 'none';
  } catch {
    return 'none';
  }
}

export function isSuperAdmin(): boolean {
  return readPlatformRole() === 'superadmin';
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');
}

export const adminApi = {
  overview: () => apiFetch<PlatformOverview>('/v1/admin/overview'),
  organizations: (q?: string) => apiFetch<Paged<AdminOrg>>(`/v1/admin/organizations${qs({ q })}`),
  suspendOrg: (id: string) =>
    apiFetch<{ id: string; status: string }>(`/v1/admin/organizations/${id}/suspend`, {
      method: 'POST',
    }),
  restoreOrg: (id: string) =>
    apiFetch<{ id: string; status: string }>(`/v1/admin/organizations/${id}/restore`, {
      method: 'POST',
    }),
  users: (q?: string) => apiFetch<Paged<AdminUser>>(`/v1/admin/users${qs({ q })}`),
  setPlatformRole: (id: string, role: PlatformRole) =>
    apiFetch<{ id: string; platformRole: PlatformRole }>(`/v1/admin/users/${id}/platform-role`, {
      method: 'POST',
      json: { role },
    }),
  events: (q?: string) => apiFetch<Paged<AdminEvent>>(`/v1/admin/events${qs({ q })}`),
};
