'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Building2, CalendarDays, LayoutDashboard, LogOut, Menu, ShieldCheck, Users, X } from 'lucide-react';
import { authApi, clearTokens } from '@/lib/auth';
import { readPlatformRole } from '@/lib/admin';

const nav = [
  { href: '/admin', label: 'Overview', Icon: LayoutDashboard },
  { href: '/admin/organizations', label: 'Organizations', Icon: Building2 },
  { href: '/admin/users', label: 'Users', Icon: Users },
  { href: '/admin/events', label: 'Events', Icon: CalendarDays },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState<'checking' | 'yes' | 'no'>('checking');
  // Mobile nav drawer. The desktop sidebar is hidden below lg, so this drawer
  // is the only way to reach the admin sections on a phone or tablet.
  const [mobileOpen, setMobileOpen] = useState(false);

  // Client-side gate. The API enforces the real boundary (PlatformGuard); this
  // just keeps non-admins from seeing the shell and bouncing them away.
  useEffect(() => {
    if (readPlatformRole() === 'superadmin') {
      setAllowed('yes');
      return;
    }
    setAllowed('no');
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('access_token') : null;
    router.replace(token ? '/dashboard' : '/login');
  }, [router]);

  // Dismiss the drawer on navigation, and let Escape close it while open.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  async function signOut() {
    try {
      await authApi.logout();
    } catch {
      // best-effort
    }
    clearTokens();
    router.replace('/login');
  }

  if (allowed !== 'yes') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-deep text-sm text-ink-secondary">
        Checking access...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface-deep text-ink-primary">
      <aside className="hidden w-64 flex-col border-r border-surface-border bg-surface lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-surface-border px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF7675]/20 text-[#FF9090]">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-bold leading-tight">Orkora</div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#FF9090]">
              Platform admin
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {nav.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href as Route}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  active
                    ? 'bg-brand-500/15 text-ink-primary'
                    : 'text-ink-secondary hover:bg-brand-500/10 hover:text-ink-primary'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-surface-border p-4">
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-secondary transition hover:bg-[#FF7675]/15 hover:text-[#FF9090]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Platform admin navigation"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-surface-border bg-surface shadow-2xl"
          >
            <div className="flex h-16 items-center justify-between border-b border-surface-border px-5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#FF7675]/20 text-[#FF9090]">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-tight">Orkora</div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-[#FF9090]">
                    Platform admin
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-ink-secondary transition hover:bg-brand-500/15 hover:text-ink-primary"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-4">
              {nav.map(({ href, label, Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href as Route}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      active
                        ? 'bg-brand-500/15 text-ink-primary'
                        : 'text-ink-secondary hover:bg-brand-500/10 hover:text-ink-primary'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-surface-border p-4">
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-secondary transition hover:bg-[#FF7675]/15 hover:text-[#FF9090]"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-surface-border bg-surface/60 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-surface-border bg-surface/40 text-ink-secondary transition hover:bg-brand-500/15 hover:text-ink-primary lg:hidden"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate text-lg font-semibold text-ink-primary">Platform administration</h1>
          </div>
          <Link href="/dashboard" className="text-xs text-ink-secondary transition hover:text-ink-primary">
            Organizer view
          </Link>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
