'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
} from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';
import { Skeleton } from '@/components/skeleton';

interface Overview {
  eventsCount: number;
  upcomingEventsCount: number;
  registrationsCount: number;
  paidOrdersCount: number;
  checkedInCount: number;
  revenueByCurrency: Record<string, number>;
  recentRegistrations: Array<{
    id: string;
    status: string;
    createdAt: string;
    tier: string | null;
    user: { id: string; fullName: string; email: string; avatarUrl: string | null };
    event: { id: string; title: string; code: string };
  }>;
  monthlyRegistrations: Array<{ month: string; count: number }>;
  topEvents: Array<{ id: string; title: string; code: string; registrations: number }>;
}

export default function DashboardOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const orgId = readActiveOrgId();
    if (!orgId) {
      setError('No active organization on this account.');
      return;
    }
    apiFetch<Overview>(`/v1/organizations/${orgId}/analytics/overview`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  const greeting = useGreeting();
  const primaryRevenue = useMemo(
    () => pickPrimaryRevenue(data?.revenueByCurrency ?? {}),
    [data?.revenueByCurrency],
  );

  const checkInRate =
    data && data.registrationsCount > 0
      ? Math.round((data.checkedInCount / data.registrationsCount) * 100)
      : 0;

  return (
    <div className="space-y-8 text-ink-primary">
      {/* Greeting */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{greeting}</h2>
          <p className="text-sm text-ink-secondary">
            Here is what is happening across your events today.
          </p>
        </div>
        <Link
          href="/dashboard/events/new"
          className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
        >
          <Sparkles className="h-4 w-4" /> New event
        </Link>
      </header>

      {error ? (
        <div className="rounded-2xl border border-[#FF7675]/30 bg-[#FF7675]/10 p-6 text-sm text-[#FF9090]">
          {error}
        </div>
      ) : null}

      {/* Hero stat cards */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {data ? (
          <>
            <HeroCard
              tone="brand"
              eyebrow={today()}
              label="Total revenue"
              value={formatRevenue(primaryRevenue)}
              sublabel={
                Object.keys(data.revenueByCurrency).length > 1
                  ? 'Multi-currency'
                  : 'Across paid orders'
              }
              avatars={data.recentRegistrations.slice(0, 3)}
            />
            <HeroCard
              tone="teal"
              eyebrow={today()}
              label="Check-in rate"
              value={`${checkInRate}%`}
              sublabel={`${data.checkedInCount.toLocaleString()} of ${data.registrationsCount.toLocaleString()} registrations`}
              avatars={data.recentRegistrations.slice(2, 5)}
            />
            <HeroCard
              tone="blue"
              eyebrow={today()}
              label="Events live"
              value={`${data.upcomingEventsCount}`}
              sublabel={`${data.eventsCount} total events`}
              avatars={data.recentRegistrations.slice(4, 7)}
            />
          </>
        ) : (
          <>
            <HeroCardSkeleton tone="brand" />
            <HeroCardSkeleton tone="teal" />
            <HeroCardSkeleton tone="blue" />
          </>
        )}
      </section>

      {/* Charts row */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel
          title="Attendance analytics"
          subtitle="Registrations per month, last 6 months"
          right={
            <div className="flex items-center gap-3 text-xs text-ink-secondary">
              <Legend dotClass="bg-brand-500" label="Top months" />
              <Legend dotClass="bg-brand-500/30" label="Other" />
            </div>
          }
        >
          <MonthlyBarChart months={data?.monthlyRegistrations ?? []} />
        </Panel>

        <Panel title="Revenue breakdown" subtitle="By source">
          <RevenueDonut
            items={[
              {
                label: 'Ticket sales',
                value: primaryRevenue.amount,
                tone: 'brand',
              },
              {
                label: 'Sponsorship',
                value: 0,
                tone: 'teal',
                hint: 'Coming soon',
              },
            ]}
            currency={primaryRevenue.currency}
          />
        </Panel>
      </section>

      {/* Bottom row */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Panel
          title="Latest registrations"
          subtitle="Across every event you run"
          right={
            <Link
              href="/dashboard/events"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300 hover:text-brand-200"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          }
        >
          {!data ? (
            <p className="py-8 text-center text-sm text-ink-muted">Loading...</p>
          ) : data.recentRegistrations.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              No registrations yet. They will show up here in real time.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-ink-muted">
                    <th className="pb-3 font-semibold">Attendee</th>
                    <th className="pb-3 font-semibold">Event</th>
                    <th className="pb-3 font-semibold">Tier</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 text-right font-semibold">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {data.recentRegistrations.map((r) => (
                    <tr key={r.id} className="text-sm">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={r.user.fullName} url={r.user.avatarUrl} />
                          <div>
                            <div className="font-semibold text-ink-primary">
                              {r.user.fullName}
                            </div>
                            <div className="text-[11px] text-ink-muted">{r.user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-ink-secondary">{r.event.title}</td>
                      <td className="py-3 text-ink-secondary">{r.tier ?? '-'}</td>
                      <td className="py-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="py-3 text-right text-[11px] text-ink-muted">
                        {timeAgo(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Most engaged" subtitle="Events by registrations">
          {!data ? (
            <p className="py-6 text-sm text-ink-muted">Loading...</p>
          ) : data.topEvents.length === 0 ? (
            <p className="py-6 text-sm text-ink-muted">No events yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.topEvents.map((e, i) => (
                <li key={e.id}>
                  <Link
                    href={`/dashboard/events/${e.id}`}
                    className="block rounded-xl border border-surface-border bg-surface-deep/40 p-3 transition hover:border-brand-500/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-ink-muted">#{i + 1}</span>
                      <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-300">
                        {e.registrations} regs
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-ink-primary">
                      {e.title}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-ink-muted">{e.code}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  );
}

/* ----------------------------- helpers ----------------------------- */

function HeroCardSkeleton({ tone }: { tone: 'brand' | 'teal' | 'blue' }) {
  const bg =
    tone === 'brand'
      ? 'bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800'
      : tone === 'teal'
        ? 'bg-gradient-to-br from-[#0EA5A5] via-[#0F8585] to-[#0B6262]'
        : 'bg-gradient-to-br from-[#3B82F6] via-[#2563EB] to-[#1D4ED8]';
  return (
    <div className={`relative overflow-hidden rounded-3xl ${bg} p-6 text-white shadow-2xl`}>
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="relative">
        <div className="h-5 w-20 animate-pulse rounded-full bg-white/20" />
        <div className="mt-6 h-4 w-28 animate-pulse rounded-md bg-white/15" />
        <div className="mt-3 h-10 w-40 animate-pulse rounded-lg bg-white/20" />
        <div className="mt-5 h-3 w-44 animate-pulse rounded-md bg-white/15" />
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Legend({ dotClass, label }: { dotClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}

function HeroCard({
  tone,
  eyebrow,
  label,
  value,
  sublabel,
  avatars,
}: {
  tone: 'brand' | 'teal' | 'blue';
  eyebrow: string;
  label: string;
  value: string;
  sublabel: string;
  avatars: Array<{ user: { fullName: string; avatarUrl: string | null } }>;
}) {
  const bg =
    tone === 'brand'
      ? 'bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800'
      : tone === 'teal'
        ? 'bg-gradient-to-br from-[#0EA5A5] via-[#0F8585] to-[#0B6262]'
        : 'bg-gradient-to-br from-[#3B82F6] via-[#2563EB] to-[#1D4ED8]';
  return (
    <div className={`relative overflow-hidden rounded-3xl ${bg} p-6 text-white shadow-2xl`}>
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="relative">
        <span className="inline-block rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold text-white/90 backdrop-blur">
          {eyebrow}
        </span>
        <p className="mt-6 text-sm font-medium text-white/80">{label}</p>
        <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{value}</p>
        <div className="mt-5 flex items-center justify-between">
          <p className="text-xs text-white/70">{sublabel}</p>
          {avatars.length > 0 ? (
            <div className="flex -space-x-2">
              {avatars.slice(0, 3).map((a, i) => (
                <Avatar
                  key={i}
                  name={a.user.fullName}
                  url={a.user.avatarUrl}
                  size="sm"
                  bordered
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MonthlyBarChart({ months }: { months: Array<{ month: string; count: number }> }) {
  // Pad to a full 6-month window even when the API returned fewer rows.
  const filled = useMemo(() => {
    const now = new Date();
    const out: Array<{ month: string; count: number; label: string }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      const found = months.find((m) => m.month === key);
      out.push({
        month: key,
        count: found?.count ?? 0,
        label: d.toLocaleDateString('en-GB', { month: 'short' }),
      });
    }
    return out;
  }, [months]);

  const max = Math.max(1, ...filled.map((m) => m.count));
  const sorted = [...filled].sort((a, b) => b.count - a.count);
  const topKeys = new Set(sorted.slice(0, 2).map((m) => m.month));

  return (
    <div className="grid h-56 grid-cols-6 items-end gap-3">
      {filled.map((m) => {
        const isTop = topKeys.has(m.month);
        const h = m.count === 0 ? 6 : Math.max(8, Math.round((m.count / max) * 200));
        return (
          <div key={m.month} className="flex flex-col items-center gap-2">
            <div className="relative flex h-52 w-full items-end justify-center">
              {isTop ? (
                <span className="absolute -top-1 inline-flex items-center gap-1 rounded-full bg-brand-500 px-2 py-0.5 text-[9px] font-bold text-white shadow-lg">
                  <TrendingUp className="h-2.5 w-2.5" />
                  {m.count}
                </span>
              ) : (
                <span className="absolute -top-1 text-[10px] text-ink-muted">{m.count}</span>
              )}
              <div
                className={`w-full rounded-t-xl transition-all ${
                  isTop
                    ? 'bg-gradient-to-t from-brand-700 to-brand-400 shadow-lg shadow-brand-500/30'
                    : 'bg-brand-500/20'
                }`}
                style={{ height: h }}
              />
            </div>
            <span className="rounded-full bg-surface-deep/60 px-2.5 py-1 text-[10px] font-semibold text-ink-secondary">
              {m.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RevenueDonut({
  items,
  currency,
}: {
  items: Array<{ label: string; value: number; tone: 'brand' | 'teal'; hint?: string }>;
  currency: string;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="flex h-32 w-32 items-center justify-center rounded-full border-8 border-surface-border">
          <span className="text-xs text-ink-muted">No revenue yet</span>
        </div>
        <p className="text-xs text-ink-muted">Numbers appear once paid orders come in.</p>
      </div>
    );
  }
  // Inline conic-gradient donut.
  const brandPct = (items[0]!.value / total) * 100;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center">
        <div
          className="relative flex h-40 w-40 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(#6C5CE7 0% ${brandPct}%, #0EA5A5 ${brandPct}% 100%)`,
          }}
        >
          <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-surface-deep">
            <p className="text-xs text-ink-muted">Total</p>
            <p className="text-lg font-bold text-ink-primary">
              {formatRevenue({ amount: total, currency })}
            </p>
          </div>
        </div>
      </div>
      <ul className="space-y-2">
        {items.map((i) => {
          const pct = total > 0 ? Math.round((i.value / total) * 100) : 0;
          const dot = i.tone === 'brand' ? 'bg-brand-500' : 'bg-[#0EA5A5]';
          return (
            <li
              key={i.label}
              className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-deep/40 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-xs text-ink-secondary">
                <span className={`h-2 w-2 rounded-full ${dot}`} />
                {i.label}
                {i.hint ? <span className="text-[10px] text-ink-muted">/ {i.hint}</span> : null}
              </span>
              <span className="text-xs font-semibold text-ink-primary">
                {formatRevenue({ amount: i.value, currency })}{' '}
                <span className="text-ink-muted">({pct}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: 'bg-[#00C896]/15 text-[#00C896]',
    pending: 'bg-[#FF7675]/15 text-[#FF9090]',
    cancelled: 'bg-surface-border text-ink-muted',
  };
  const tone = map[status] ?? 'bg-brand-500/15 text-brand-300';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>
      {status}
    </span>
  );
}

function Avatar({
  name,
  url,
  size = 'md',
  bordered = false,
}: {
  name: string;
  url: string | null;
  size?: 'sm' | 'md';
  bordered?: boolean;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';
  const ring = bordered ? 'border-2 border-white/30' : '';
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className={`${dim} ${ring} rounded-full object-cover`} />;
  }
  // Stable colour from initials so the same person looks the same everywhere.
  const palettes = [
    'from-brand-500 to-brand-700',
    'from-[#FF7675] to-[#FF5757]',
    'from-[#00C896] to-[#0F8585]',
    'from-[#3B82F6] to-[#1D4ED8]',
    'from-[#F59E0B] to-[#B45309]',
  ];
  const idx = (initials.charCodeAt(0) ?? 0) % palettes.length;
  return (
    <span
      className={`flex items-center justify-center rounded-full font-semibold text-white ${dim} ${ring} bg-gradient-to-br ${palettes[idx]}`}
    >
      {initials || '?'}
    </span>
  );
}

function pickPrimaryRevenue(by: Record<string, number>): { amount: number; currency: string } {
  const entries = Object.entries(by);
  if (entries.length === 0) return { amount: 0, currency: 'NGN' };
  entries.sort((a, b) => b[1] - a[1]);
  const [currency, amount] = entries[0]!;
  return { currency, amount };
}

function formatRevenue({ amount, currency }: { amount: number; currency: string }): string {
  const major = amount / 100;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      notation: major >= 1_000_000 ? 'compact' : 'standard',
    }).format(major);
  } catch {
    return `${currency} ${major.toLocaleString()}`;
  }
}

function useGreeting(): string {
  const [g, setG] = useState('Hello');
  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setG('Good morning');
    else if (h < 18) setG('Good afternoon');
    else setG('Good evening');
  }, []);
  return g;
}

function today(): string {
  return new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
}
