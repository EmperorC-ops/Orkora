'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Home,
  LogOut,
  Settings,
  Ticket,
  Users,
} from 'lucide-react';
import { authApi, clearTokens } from '@/lib/auth';
import { useToast } from '@/components/toast';

const nav = [
  { href: '/dashboard', label: 'Overview', Icon: Home },
  { href: '/dashboard/events', label: 'Events', Icon: Calendar },
  { href: '/dashboard/registrations', label: 'Registrations', Icon: Ticket },
  { href: '/dashboard/attendees', label: 'Attendees', Icon: Users },
  { href: '/dashboard/analytics', label: 'Analytics', Icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Settings', Icon: Settings },
];

interface SessionUser {
  email: string;
  fullName: string;
  initials: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Decode the JWT once on mount to surface the user's name in the header.
  useEffect(() => {
    const token = sessionStorage.getItem('access_token');
    if (!token) return;
    try {
      const [, body] = token.split('.');
      if (!body) return;
      const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as {
        email?: string;
        fullName?: string;
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
      setUser({ email, fullName, initials });
    } catch {
      // Ignore: header just falls back to the brand mark.
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
        <div className="flex h-16 items-center gap-2 border-b border-surface-border px-6">
          <div className="h-8 w-8 rounded-lg bg-brand-gradient" />
          <span className="font-bold text-ink-primary">Orkora</span>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {nav.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
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
                <div className="truncate text-[10px] text-ink-muted">{user.email}</div>
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
          <h1 className="text-lg font-semibold text-ink-primary">Organizer workspace</h1>
          <div className="flex items-center gap-3">
            {user ? (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-xs text-ink-secondary">{user.fullName}</span>
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
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
