'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Home,
  LogOut,
  Mail,
  CreditCard,
  Settings,
  Sparkles,
  Ticket,
  Users,
} from 'lucide-react';
import { apiFetch, authApi, clearTokens } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { readActiveOrgId } from '@/lib/events';
import { isSuperAdmin } from '@/lib/admin';
import { Onboarding } from '@/components/onboarding';
import { Brand } from '@/components/brand';

const nav = [
  { href: '/dashboard', label: 'Overview', Icon: Home },
  { href: '/dashboard/events', label: 'Events', Icon: Calendar },
  { href: '/dashboard/registrations', label: 'Registrations', Icon: Ticket },
  { href: '/dashboard/attendees', label: 'Attendees', Icon: Users },
  { href: '/dashboard/analytics', label: 'Analytics', Icon: BarChart3 },
  { href: '/dashboard/campaigns', label: 'Campaigns', Icon: Mail },
  { href: '/dashboard/branding', label: 'Brand Home', Icon: Sparkles },
  { href: '/dashboard/billing', label: 'Billing', Icon: CreditCard },
  { href: '/dashboard/settings', label: 'Settings', Icon: Settings },
] as const;

interface SessionUser {
  email: string;
  fullName: string;
  initials: string;
  role: string;
}

// Human-friendly labels for the org-level roles carried in the JWT.
const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  organizer: 'Organizer',
  staff: 'Staff',
  vendor: 'Vendor',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  // 'checking' = waiting on the JWT decode, 'none' = no memberships,
  // 'has' = at least one membership. Drives the onboarding gate.
  const [orgState, setOrgState] = useState<'checking' | 'none' | 'has'>('checking');

  // The platform master account is not an organizer; send it to /admin so it
  // never lands on the org onboarding gate.
  useEffect(() => {
    if (isSuperAdmin()) router.replace('/admin');
  }, [router]);

  // Decode the JWT once on mount to surface the user's name + role in the
  // header. The role comes from the active membership so the header can show
  // "Owner", "Organizer", etc. next to the person's name.
  useEffect(() => {
    const token = sessionStorage.getItem('access_token');
    if (!token) return;
    try {
      const [, body] = token.split('.');
      if (!body) return;
      const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as {
        email?: string;
        fullName?: string;
        memberships?: Array<{ orgId: string; role: string }>;
      };
      const email = payload.email ?? '';
      const fullName = payload.fullName ?? email.split('@')[0] ?? '';
      const initials =
        fullName
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? '')
          .join('') || '?';
      const ms = payload.memberships ?? [];
      const active =
        ms.find((m) => ['owner', 'admin', 'organizer'].includes(m.role)) ?? ms[0];
      setUser({ email, fullName, initials, role: active?.role ?? '' });
    } catch {
      // Ignore: header just falls back to the brand mark.
    }
  }, []);

  // Determine whether the user has any organization memberships. If not,
  // we render the Onboarding gate instead of the normal child routes. When
  // there is an active org, fetch its name so the workspace header reads with
  // the tenant's brand instead of a generic "Organizer workspace".
  useEffect(() => {
    const id = readActiveOrgId();
    setOrgState(id ? 'has' : 'none');
    if (id) {
      apiFetch<{ name?: string }>(`/v1/organizations/${id}`)
        .then((org) => setOrgName(org?.name ?? null))
        .catch(() => setOrgName(null));
    }
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await authApi.logout();
    } catch {
      // Ignore: best-effort server-side revoke. We always clear locally.
    }
    clearTokens();
    toast.success('Signed out', 'See you next time.');
    router.replace('/login');
  }

  return (
    <div className="flex min-h-screen bg-app-gradient text-ink-primary">
      <aside className="hidden w-64 flex-col border-r border-surface-border bg-surface lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-surface-border px-5">
          <Brand variant="mark" width={32} className="h-8 w-8 flex-none" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight text-ink-primary">
              {orgName ?? 'Orkora'}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-ink-muted">on Orkora</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {nav.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href as Route}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-brand-500/15 hover:text-ink-primary"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="space-y-3 border-t border-surface-border p-4">
          {user ? (
            <div className="flex items-center gap-3 rounded-lg bg-surface-deep/40 px-3 py-2">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">
                {user.initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-ink-primary">
                  {user.fullName}
                </div>
                <div className="truncate text-[10px] text-ink-muted">
                  {user.role ? `${ROLE_LABEL[user.role] ?? user.role} · ` : ''}
                  {user.email}
                </div>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-secondary transition hover:bg-[#FF7675]/15 hover:text-[#FF9090] disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-surface-border bg-surface/60 px-6 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight text-ink-primary">
              {orgName ? `${orgName} Workspace` : 'Workspace'}
            </h1>
            {user?.role ? (
              <p className="text-[11px] text-ink-muted">
                Signed in as {ROLE_LABEL[user.role] ?? user.role}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <div className="hidden items-center gap-2 sm:flex">
                <div className="text-right">
                  <div className="text-xs font-medium text-ink-secondary">{user.fullName}</div>
                  {user.role ? (
                    <div className="text-[10px] uppercase tracking-wider text-brand-300">
                      {ROLE_LABEL[user.role] ?? user.role}
                    </div>
                  ) : null}
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">
                  {user.initials}
                </span>
              </div>
            ) : (
              <div className="h-9 w-9 rounded-full bg-brand-gradient" />
            )}
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface/40 px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:bg-[#FF7675]/15 hover:text-[#FF9090] disabled:opacity-60 lg:hidden"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">
          {orgState === 'checking' ? null : orgState === 'none' ? <Onboarding /> : children}
        </main>
      </div>
    </div>
  );
}
