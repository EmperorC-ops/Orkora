'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  DollarSign,
  MessageSquare,
  Ticket,
  TrendingUp,
  Users,
  Vote,
} from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';

interface EventOverview {
  event: {
    id: string;
    title: string;
    code: string;
    startAt: string;
    endAt: string;
    capacity: number | null;
  };
  registrations: number;
  ticketsSold: number;
  ticketsCapacity: number;
  checkedIn: number;
  revenueByCurrency: Record<string, number>;
  messageCount: number;
  pollVotes: number;
  tiers: Array<{
    id: string;
    name: string;
    sold: number;
    total: number | null;
    priceMinor: number;
    currency: string;
  }>;
  dailyRegistrations: Array<{ day: string; count: number }>;
}

export default function EventAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const [data, setData] = useState<EventOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const orgId = readActiveOrgId();
    if (!orgId || !eventId) return;
    apiFetch<EventOverview>(`/v1/organizations/${orgId}/analytics/events/${eventId}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [eventId]);

  if (error) {
    return (
      <div className="rounded-2xl border border-[#FF7675]/30 bg-[#FF7675]/5 p-6 text-sm text-[#FF9090]">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center text-sm text-ink-secondary">
        Loading analytics...
      </div>
    );
  }

  const sellThroughPct =
    data.ticketsCapacity > 0 ? Math.round((data.ticketsSold / data.ticketsCapacity) * 100) : null;
  const checkInPct =
    data.ticketsSold > 0 ? Math.round((data.checkedIn / data.ticketsSold) * 100) : 0;
  const primaryRevenue = pickPrimaryRevenue(data.revenueByCurrency);

  return (
    <div className="space-y-8 text-ink-primary">
      <Link
        href={`/dashboard/events/${eventId}`}
        className="inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to event
      </Link>

      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Analytics</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{data.event.title}</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            {new Date(data.event.startAt).toLocaleDateString('en-GB', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
          <span className="mx-3 text-ink-muted">/</span>
          Code <span className="font-mono">{data.event.code}</span>
        </p>
      </header>

      {/* Hero stat tiles */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <HeroStat
          tone="brand"
          eyebrow="Today"
          label="Total revenue"
          value={formatRevenue(primaryRevenue)}
          sublabel={data.registrations > 0 ? `${data.registrations} registrations` : 'No registrations yet'}
          icon={DollarSign}
        />
        <HeroStat
          tone="teal"
          eyebrow="Today"
          label="Check-in rate"
          value={`${checkInPct}%`}
          sublabel={`${data.checkedIn} of ${data.ticketsSold} tickets`}
          icon={CheckCircle2}
        />
        <HeroStat
          tone="blue"
          eyebrow="Today"
          label="Tickets sold"
          value={data.ticketsSold.toLocaleString()}
          sublabel={
            sellThroughPct !== null
              ? `${sellThroughPct}% sell-through`
              : 'No fixed capacity set'
          }
          icon={Ticket}
        />
      </section>

      {/* Charts row */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel
          title="Registrations over time"
          subtitle={
            data.dailyRegistrations.length > 0
              ? `Day-by-day, ${data.dailyRegistrations.length} day${data.dailyRegistrations.length === 1 ? '' : 's'} so far`
              : 'Day-by-day timeline'
          }
        >
          <DailyChart points={data.dailyRegistrations} />
        </Panel>

        <Panel title="Sell-through" subtitle="Across all tiers">
          <SellThroughDonut sold={data.ticketsSold} capacity={data.ticketsCapacity} />
        </Panel>
      </section>

      {/* Tier breakdown + engagement */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Tier breakdown" subtitle="Sales and revenue by tier">
          <ul className="mt-1 space-y-3">
            {data.tiers.map((t, i) => {
              const cap = t.total ?? null;
              const pct = cap && cap > 0 ? Math.round((t.sold / cap) * 100) : null;
              const palette = [
                'from-brand-500 to-brand-300',
                'from-[#FF7675] to-[#FF9090]',
                'from-[#0EA5A5] to-[#34D399]',
                'from-[#3B82F6] to-[#60A5FA]',
                'from-[#F59E0B] to-[#FCD34D]',
              ];
              const grad = palette[i % palette.length];
              return (
                <li
                  key={t.id}
                  className="rounded-2xl border border-surface-border bg-surface-deep/40 p-4"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-ink-primary">{t.name}</span>
                    <span className="text-xs text-ink-secondary">
                      {t.sold} {cap ? `/ ${cap}` : 'sold'}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-border">
                    <div
                      className={`h-full bg-gradient-to-r ${grad}`}
                      style={{ width: `${pct ?? Math.min(100, t.sold % 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-ink-muted">{formatMoney(t.priceMinor, t.currency)}</span>
                    <span className="font-semibold text-ink-secondary">
                      {pct !== null ? `${pct}% sold` : 'No cap'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Engagement" subtitle="Live activity volume">
          <div className="grid grid-cols-2 gap-3">
            <MetricBlock
              icon={MessageSquare}
              tone="brand"
              label="Chat messages"
              value={data.messageCount.toLocaleString()}
              hint="In the live room"
            />
            <MetricBlock
              icon={Vote}
              tone="teal"
              label="Poll votes"
              value={data.pollVotes.toLocaleString()}
              hint="Across sessions"
            />
            <MetricBlock
              icon={Users}
              tone="warm"
              label="Registrations"
              value={data.registrations.toLocaleString()}
              hint="All-time"
            />
            <MetricBlock
              icon={TrendingUp}
              tone="cool"
              label="Check-ins"
              value={data.checkedIn.toLocaleString()}
              hint="Tickets scanned"
            />
          </div>
        </Panel>
      </section>
    </div>
  );
}

/* ----------------------------- helpers ----------------------------- */

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface/40 p-5">
      <div>
        <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function HeroStat({
  tone,
  eyebrow,
  label,
  value,
  sublabel,
  icon: Icon,
}: {
  tone: 'brand' | 'teal' | 'blue';
  eyebrow: string;
  label: string;
  value: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
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
      <div className="relative flex items-start justify-between">
        <span className="inline-block rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold text-white/90 backdrop-blur">
          {eyebrow}
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="relative mt-6 text-sm font-medium text-white/80">{label}</p>
      <p className="relative mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{value}</p>
      <p className="relative mt-4 text-xs text-white/70">{sublabel}</p>
    </div>
  );
}

function DailyChart({ points }: { points: Array<{ day: string; count: number }> }) {
  const max = useMemo(() => Math.max(1, ...points.map((p) => p.count)), [points]);
  if (points.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-muted">
        No registration data yet. The chart fills in as people register.
      </p>
    );
  }
  return (
    <div
      className="grid h-56 items-end gap-1.5"
      style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
    >
      {points.map((p) => {
        const h = Math.max(8, Math.round((p.count / max) * 200));
        return (
          <div key={p.day} className="flex flex-col items-center gap-2">
            <div className="relative flex h-52 w-full items-end justify-center">
              <span className="absolute -top-1 text-[10px] text-ink-muted">{p.count}</span>
              <div
                className="w-full rounded-t-lg bg-gradient-to-t from-brand-700 to-brand-400 shadow-lg shadow-brand-500/20"
                style={{ height: h }}
              />
            </div>
            <span className="text-[9px] text-ink-muted">{p.day.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

function SellThroughDonut({ sold, capacity }: { sold: number; capacity: number }) {
  if (capacity === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="flex h-32 w-32 items-center justify-center rounded-full border-8 border-surface-border">
          <span className="text-xs text-ink-muted">No cap</span>
        </div>
        <p className="text-xs text-ink-muted">
          This event has no fixed ticket capacity.
        </p>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((sold / capacity) * 100));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center">
        <div
          className="relative flex h-40 w-40 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(#6C5CE7 0% ${pct}%, rgba(108,92,231,0.15) ${pct}% 100%)`,
          }}
        >
          <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-surface-deep">
            <p className="text-xs text-ink-muted">Sold</p>
            <p className="text-2xl font-bold text-ink-primary">{pct}%</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-surface-border bg-surface-deep/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-muted">Sold</div>
          <div className="mt-1 text-base font-semibold text-ink-primary">{sold}</div>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-deep/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-muted">Capacity</div>
          <div className="mt-1 text-base font-semibold text-ink-primary">{capacity}</div>
        </div>
      </div>
    </div>
  );
}

function MetricBlock({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: 'brand' | 'teal' | 'warm' | 'cool';
  label: string;
  value: string;
  hint: string;
}) {
  const t =
    tone === 'brand'
      ? 'from-brand-500/30 to-brand-700/10 text-brand-300'
      : tone === 'teal'
        ? 'from-[#0EA5A5]/30 to-[#0B6262]/10 text-[#34D399]'
        : tone === 'warm'
          ? 'from-[#FF7675]/25 to-[#FF5757]/5 text-[#FF9090]'
          : 'from-[#3B82F6]/30 to-[#1D4ED8]/10 text-[#60A5FA]';
  return (
    <div className={`rounded-xl border border-surface-border bg-gradient-to-br ${t} p-4`}>
      <Icon className="h-4 w-4" />
      <p className="mt-3 text-xs text-ink-secondary">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink-primary">{value}</p>
      <p className="mt-1 text-[10px] text-ink-muted">{hint}</p>
    </div>
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

function formatMoney(minor: number, currency: string): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(major);
  } catch {
    return `${currency} ${major.toLocaleString()}`;
  }
}
