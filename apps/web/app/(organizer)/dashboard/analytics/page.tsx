'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  MessageCircle,
  TicketCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';

interface OrgAnalyticsRollup {
  totals: {
    eventsCount: number;
    registrationsTotal: number;
    paidOrdersCount: number;
    pendingOrdersCount: number;
    ticketsIssued: number;
    checkedIn: number;
    messagesCount: number;
    revenueByCurrency: Record<string, number>;
  };
  funnel: {
    registrations: number;
    paidOrders: number;
    ticketsIssued: number;
    checkedIn: number;
  };
  monthly: Array<{
    month: string;
    registrations: number;
    paidOrders: number;
    revenueMinor: number;
  }>;
  events: Array<{
    id: string;
    title: string;
    code: string;
    status: string;
    startAt: string | null;
    registrations: number;
    paidOrders: number;
    revenueMinor: number;
    currency: string | null;
    checkedIn: number;
  }>;
}

export default function OrgAnalyticsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [data, setData] = useState<OrgAnalyticsRollup | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrgId(readActiveOrgId());
  }, []);

  useEffect(() => {
    if (!orgId) return;
    apiFetch<OrgAnalyticsRollup>(`/v1/organizations/${orgId}/analytics/rollup`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [orgId]);

  const primaryRevenue = useMemo(
    () => pickPrimaryRevenue(data?.totals.revenueByCurrency ?? {}),
    [data?.totals.revenueByCurrency],
  );

  const checkInRate =
    data && data.funnel.ticketsIssued > 0
      ? Math.round((data.funnel.checkedIn / data.funnel.ticketsIssued) * 100)
      : 0;

  const conversionRate =
    data && data.funnel.registrations > 0
      ? Math.round((data.funnel.paidOrders / data.funnel.registrations) * 100)
      : 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Analytics</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            How everything is moving
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Twelve-month rollup of registrations, paid orders, and check-ins across every event.
          </p>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-[#FF7675]/30 bg-[#FF7675]/5 p-6 text-sm text-[#FF9090]">
          {error}
        </div>
      ) : !data ? (
        <SkeletonGrid />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile
              tone="brand"
              label="Revenue"
              value={formatRevenue(primaryRevenue)}
              hint={
                Object.keys(data.totals.revenueByCurrency).length > 1
                  ? 'Multi-currency'
                  : 'Across paid orders'
              }
              icon={<CreditCard className="h-4 w-4" />}
            />
            <KpiTile
              tone="teal"
              label="Registrations"
              value={data.totals.registrationsTotal.toLocaleString()}
              hint={`${data.totals.eventsCount} event${data.totals.eventsCount === 1 ? '' : 's'}`}
              icon={<Users className="h-4 w-4" />}
            />
            <KpiTile
              tone="blue"
              label="Tickets issued"
              value={data.totals.ticketsIssued.toLocaleString()}
              hint={`${data.totals.checkedIn.toLocaleString()} checked in`}
              icon={<TicketCheck className="h-4 w-4" />}
            />
            <KpiTile
              tone="amber"
              label="Engagement"
              value={data.totals.messagesCount.toLocaleString()}
              hint="Chat messages"
              icon={<MessageCircle className="h-4 w-4" />}
            />
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
            <Panel
              title="Registrations & paid orders"
              subtitle="Last 12 months"
              right={<Legend dotClass="bg-brand-500" label="Registrations" extra="bg-[#00C896]" extraLabel="Paid orders" />}
            >
              <DualBarChart series={data.monthly} />
            </Panel>
            <Panel title="Conversion funnel" subtitle="Org-wide">
              <Funnel
                steps={[
                  { label: 'Registrations', value: data.funnel.registrations },
                  { label: 'Paid orders', value: data.funnel.paidOrders },
                  { label: 'Tickets issued', value: data.funnel.ticketsIssued },
                  { label: 'Checked in', value: data.funnel.checkedIn },
                ]}
                conversionRate={conversionRate}
                checkInRate={checkInRate}
              />
            </Panel>
          </section>

          <Panel
            title="Events breakdown"
            subtitle="Sorted by start date"
            right={
              <Link
                href="/dashboard/events"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300 hover:text-brand-200"
              >
                View all events <ArrowUpRight className="h-3 w-3" />
              </Link>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-ink-muted">
                    <th className="pb-3 font-semibold">Event</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 text-right font-semibold">Registrations</th>
                    <th className="pb-3 text-right font-semibold">Paid orders</th>
                    <th className="pb-3 text-right font-semibold">Revenue</th>
                    <th className="pb-3 text-right font-semibold">Checked in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {data.events.map((e) => (
                    <tr key={e.id} className="text-sm">
                      <td className="py-3">
                        <Link
                          href={`/dashboard/events/${e.id}`}
                          className="font-semibold text-ink-primary transition hover:text-brand-300"
                        >
                          {e.title}
                        </Link>
                        <div className="font-mono text-[10px] text-ink-muted">{e.code}</div>
                      </td>
                      <td className="py-3">
                        <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-300">
                          {e.status}
                        </span>
                      </td>
                      <td className="py-3 text-right text-ink-secondary">
                        {e.registrations.toLocaleString()}
                      </td>
                      <td className="py-3 text-right text-ink-secondary">
                        {e.paidOrders.toLocaleString()}
                      </td>
                      <td className="py-3 text-right text-ink-secondary">
                        {e.currency
                          ? formatRevenue({ amount: e.revenueMinor, currency: e.currency })
                          : '-'}
                      </td>
                      <td className="py-3 text-right text-ink-secondary">
                        {e.checkedIn.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

/* ---- chart and tile helpers ---- */

function SkeletonGrid() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-surface-border bg-surface/40"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="h-72 animate-pulse rounded-2xl border border-surface-border bg-surface/40" />
        <div className="h-72 animate-pulse rounded-2xl border border-surface-border bg-surface/40" />
      </div>
    </>
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

function Legend({
  dotClass,
  label,
  extra,
  extraLabel,
}: {
  dotClass: string;
  label: string;
  extra?: string;
  extraLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-ink-secondary">
      <span className="inline-flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        {label}
      </span>
      {extra && extraLabel ? (
        <span className="inline-flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${extra}`} />
          {extraLabel}
        </span>
      ) : null}
    </div>
  );
}

function KpiTile({
  tone,
  label,
  value,
  hint,
  icon,
}: {
  tone: 'brand' | 'teal' | 'blue' | 'amber';
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  const bg =
    tone === 'brand'
      ? 'bg-brand-500/15 text-brand-300'
      : tone === 'teal'
        ? 'bg-[#0EA5A5]/15 text-[#0EA5A5]'
        : tone === 'blue'
          ? 'bg-[#3B82F6]/15 text-[#3B82F6]'
          : 'bg-[#F59E0B]/15 text-[#F59E0B]';
  return (
    <div className="rounded-2xl border border-surface-border bg-surface/40 p-5">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-bold text-ink-primary">{value}</div>
      <p className="mt-1 text-[11px] text-ink-muted">{hint}</p>
    </div>
  );
}

function DualBarChart({
  series,
}: {
  series: Array<{ month: string; registrations: number; paidOrders: number }>;
}) {
  const filled = useMemo(() => {
    const now = new Date();
    const out: Array<{
      month: string;
      registrations: number;
      paidOrders: number;
      label: string;
    }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      const found = series.find((m) => m.month === key);
      out.push({
        month: key,
        registrations: found?.registrations ?? 0,
        paidOrders: found?.paidOrders ?? 0,
        label: d.toLocaleDateString('en-GB', { month: 'short' }),
      });
    }
    return out;
  }, [series]);

  const max = Math.max(1, ...filled.map((m) => Math.max(m.registrations, m.paidOrders)));

  return (
    <div className="grid h-56 grid-cols-12 items-end gap-1.5">
      {filled.map((m) => {
        const regH = m.registrations === 0 ? 4 : Math.max(8, Math.round((m.registrations / max) * 200));
        const paidH = m.paidOrders === 0 ? 4 : Math.max(8, Math.round((m.paidOrders / max) * 200));
        return (
          <div key={m.month} className="flex flex-col items-center gap-1.5">
            <div className="flex h-52 w-full items-end justify-center gap-1">
              <div
                className="w-1/2 rounded-t-md bg-gradient-to-t from-brand-700 to-brand-400"
                style={{ height: regH }}
                title={`${m.registrations} registrations`}
              />
              <div
                className="w-1/2 rounded-t-md bg-gradient-to-t from-[#0E8C76] to-[#00C896]"
                style={{ height: paidH }}
                title={`${m.paidOrders} paid orders`}
              />
            </div>
            <span className="text-[9px] font-semibold text-ink-secondary">{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Funnel({
  steps,
  conversionRate,
  checkInRate,
}: {
  steps: Array<{ label: string; value: number }>;
  conversionRate: number;
  checkInRate: number;
}) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {steps.map((s, i) => {
          const pct = Math.round((s.value / max) * 100);
          const tones = [
            'from-brand-500 to-brand-700',
            'from-[#0EA5A5] to-[#0F8585]',
            'from-[#3B82F6] to-[#1D4ED8]',
            'from-[#F59E0B] to-[#B45309]',
          ];
          return (
            <li key={s.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink-primary">{s.label}</span>
                <span className="text-ink-muted">{s.value.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-deep/60">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${tones[i] ?? tones[0]}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-surface-border bg-surface-deep/40 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-muted">
            <TrendingUp className="h-3 w-3" /> Reg → Paid
          </div>
          <div className="mt-1 text-base font-semibold text-ink-primary">{conversionRate}%</div>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface-deep/40 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-muted">
            <CheckCircle2 className="h-3 w-3" /> Check-in
          </div>
          <div className="mt-1 text-base font-semibold text-ink-primary">{checkInRate}%</div>
        </div>
      </div>
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

