'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Mail,
  Phone,
  RefreshCw,
  RotateCcw,
  TicketCheck,
} from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';
import { useToast } from '@/components/toast';

interface AttendeeDetail {
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
    createdAt: string;
  };
  stats: {
    eventsAttended: number;
    ticketCount: number;
    totalSpentByCurrency: Record<string, number>;
  };
  registrations: Array<{
    id: string;
    status: string;
    createdAt: string;
    event: { id: string; title: string; code: string; startAt: string | null };
    tickets: Array<{ id: string; code: string; status: string; tier: string }>;
  }>;
  orders: Array<{
    id: string;
    status: string;
    currency: string;
    totalMinor: number;
    provider: string | null;
    createdAt: string;
    paidAt: string | null;
    refundInitiatedAt: string | null;
    eventId: string;
  }>;
}

export default function AttendeeDetailPage() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId ?? '';
  const toast = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [data, setData] = useState<AttendeeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refundingOrderId, setRefundingOrderId] = useState<string | null>(null);
  const [recheckingOrderId, setRecheckingOrderId] = useState<string | null>(null);

  useEffect(() => {
    setOrgId(readActiveOrgId());
  }, []);

  function refreshDetail(active: string | null = orgId) {
    if (!active || !userId) return;
    apiFetch<AttendeeDetail>(`/v1/organizations/${active}/attendees/${userId}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    refreshDetail(orgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, userId]);

  /**
   * Initiate a refund through the configured PSP. Most card refunds settle
   * synchronously, so the API flips the order to `refunded` immediately and
   * returns `status: 'refunded'`; slower (bank-backed) refunds come back as
   * `status: 'pending'` and are finished later by the provider webhook or the
   * refund reconciliation sweep. We surface that distinction in the toast.
   */
  async function refundOrder(orderId: string, amountLabel: string) {
    if (!orgId) return;
    if (!confirm(`Refund ${amountLabel} for this order? This cannot be undone.`)) {
      return;
    }
    setRefundingOrderId(orderId);
    try {
      const res = await apiFetch<{ ok: true; status: 'refunded' | 'pending' }>(
        `/v1/organizations/${orgId}/payments/orders/${orderId}/refund`,
        { method: 'POST', json: {} },
      );
      if (res.status === 'refunded') {
        toast.success('Refunded', `${amountLabel} has been refunded.`);
      } else {
        toast.success('Refund initiated', 'Status will update once the provider confirms.');
      }
      refreshDetail(orgId);
    } catch (err) {
      toast.error('Could not refund', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRefundingOrderId(null);
    }
  }

  /**
   * Re-check a refund against the provider and settle it locally if it has
   * actually been refunded. Rescues an order stuck on `paid` when the refund
   * webhook never settled it, without opening the provider dashboard.
   */
  async function recheckRefund(orderId: string) {
    if (!orgId) return;
    setRecheckingOrderId(orderId);
    try {
      const res = await apiFetch<{ status: 'refunded' | 'pending' | 'paid' }>(
        `/v1/organizations/${orgId}/payments/orders/${orderId}/refund/recheck`,
        { method: 'POST', json: {} },
      );
      if (res.status === 'refunded') {
        toast.success('Refund settled', 'The provider confirmed the refund; the order is now refunded.');
        refreshDetail(orgId);
      } else {
        toast.info('No refund found yet', 'The provider has not refunded this charge. Try again later.');
      }
    } catch (err) {
      toast.error('Could not re-check', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRecheckingOrderId(null);
    }
  }

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard/attendees"
        className="inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to attendees
      </Link>

      {error ? (
        <div className="rounded-2xl border border-[#FF7675]/30 bg-[#FF7675]/5 p-6 text-sm text-[#FF9090]">
          {error}
        </div>
      ) : !data ? (
        <SkeletonDetail />
      ) : (
        <>
          <header className="rounded-3xl border border-surface-border bg-surface/40 p-6">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={data.user.fullName} url={data.user.avatarUrl} />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-semibold text-ink-primary">
                  {data.user.fullName}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-secondary">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> {data.user.email}
                  </span>
                  {data.user.phone && (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" /> {data.user.phone}
                    </span>
                  )}
                  <span className="text-xs text-ink-muted">
                    Member since {new Date(data.user.createdAt).toLocaleDateString('en-GB', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Tile
                icon={<Calendar className="h-4 w-4" />}
                label="Events attended"
                value={data.stats.eventsAttended.toString()}
              />
              <Tile
                icon={<TicketCheck className="h-4 w-4" />}
                label="Tickets"
                value={data.stats.ticketCount.toString()}
              />
              <Tile
                icon={<DollarSign className="h-4 w-4" />}
                label="Lifetime spend"
                value={formatTotals(data.stats.totalSpentByCurrency)}
              />
            </dl>
          </header>

          <Section title="Registrations" subtitle="Every event this person joined">
            {data.registrations.length === 0 ? (
              <Empty text="No registrations." />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-surface-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Event</th>
                      <th className="px-5 py-3 font-semibold">Tickets</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Registered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border bg-surface/40">
                    {data.registrations.map((r) => (
                      <tr key={r.id}>
                        <td className="px-5 py-4">
                          <Link
                            href={`/dashboard/events/${r.event.id}`}
                            className="font-semibold text-ink-primary transition hover:text-brand-300"
                          >
                            {r.event.title}
                          </Link>
                          <div className="font-mono text-[10px] text-ink-muted">
                            {r.event.code}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-ink-secondary">
                          {r.tickets.length} ticket{r.tickets.length === 1 ? '' : 's'}
                          {r.tickets[0]?.tier ? ` · ${r.tickets[0].tier}` : ''}
                        </td>
                        <td className="px-5 py-4">
                          <StatusPill status={r.status} />
                        </td>
                        <td className="px-5 py-4 text-[11px] text-ink-muted">
                          {new Date(r.createdAt).toLocaleString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Orders" subtitle="Payments, refunds, and pending holds">
            {data.orders.length === 0 ? (
              <Empty text="No orders yet." />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-surface-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Amount</th>
                      <th className="px-5 py-3 font-semibold">Provider</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Created</th>
                      <th className="px-5 py-3 font-semibold">Paid</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border bg-surface/40">
                    {data.orders.map((o) => (
                      <tr key={o.id}>
                        <td className="px-5 py-4 font-semibold text-ink-primary">
                          {formatMoney(o.totalMinor, o.currency)}
                        </td>
                        <td className="px-5 py-4 text-ink-secondary">
                          {o.provider ?? '-'}
                        </td>
                        <td className="px-5 py-4">
                          <StatusPill status={o.status} />
                        </td>
                        <td className="px-5 py-4 text-[11px] text-ink-muted">
                          {new Date(o.createdAt).toLocaleString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-5 py-4 text-[11px] text-ink-muted">
                          {o.paidAt
                            ? new Date(o.paidAt).toLocaleString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {o.status === 'paid' ? (
                            <div className="flex flex-col items-end gap-1.5">
                              {o.refundInitiatedAt ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#3B82F6]">
                                  Refund pending
                                </span>
                              ) : null}
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => recheckRefund(o.id)}
                                  disabled={recheckingOrderId === o.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-surface-border px-2 py-1 text-xs font-semibold text-ink-secondary transition hover:bg-surface disabled:opacity-50"
                                  aria-label="Re-check refund status"
                                  title="Re-check the refund status with the payment provider"
                                >
                                  <RefreshCw
                                    className={`h-3 w-3 ${recheckingOrderId === o.id ? 'animate-spin' : ''}`}
                                  />
                                  {recheckingOrderId === o.id ? 'Checking...' : 'Re-check'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    refundOrder(o.id, formatMoney(o.totalMinor, o.currency))
                                  }
                                  disabled={refundingOrderId === o.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-[#FF7675]/40 px-2 py-1 text-xs font-semibold text-[#FF9090] transition hover:bg-[#FF7675]/10 disabled:opacity-50"
                                  aria-label="Refund order"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  {refundingOrderId === o.id ? 'Refunding...' : 'Refund'}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function SkeletonDetail() {
  return (
    <>
      <div className="rounded-3xl border border-surface-border bg-surface/40 p-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 animate-pulse rounded-full bg-surface-border" />
          <div className="flex-1 space-y-3">
            <div className="h-4 w-48 animate-pulse rounded bg-surface-border" />
            <div className="h-3 w-72 animate-pulse rounded bg-surface-border/70" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-border/60" />
          ))}
        </div>
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-surface-border bg-surface/40" />
    </>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-ink-primary">{title}</h2>
        {subtitle ? <p className="text-xs text-ink-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface/40 p-8 text-center text-sm text-ink-muted">
      {text}
    </div>
  );
}


function Tile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-deep/40 px-4 py-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-ink-primary">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: 'bg-[#00C896]/15 text-[#00C896]',
    paid: 'bg-[#00C896]/15 text-[#00C896]',
    pending: 'bg-[#FF7675]/15 text-[#FF9090]',
    cancelled: 'bg-surface-border text-ink-muted',
    refunded: 'bg-[#3B82F6]/15 text-[#3B82F6]',
  };
  const tone = map[status] ?? 'bg-brand-500/15 text-brand-300';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>
      {status}
    </span>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-16 w-16 flex-none rounded-full object-cover" />;
  }
  const palettes = [
    'from-brand-500 to-brand-700',
    'from-[#FF7675] to-[#FF5757]',
    'from-[#0EA5A5] to-[#0F8585]',
    'from-[#3B82F6] to-[#1D4ED8]',
    'from-[#F59E0B] to-[#B45309]',
  ];
  const idx = (initials.charCodeAt(0) ?? 0) % palettes.length;
  return (
    <span
      className={`flex h-16 w-16 flex-none items-center justify-center rounded-full bg-gradient-to-br text-lg font-bold text-white ${palettes[idx]}`}
    >
      {initials || '?'}
    </span>
  );
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

function formatTotals(by: Record<string, number>): string {
  const entries = Object.entries(by);
  if (entries.length === 0) return '-';
  entries.sort((a, b) => b[1] - a[1]);
  const [c, m] = entries[0]!;
  const head = formatMoney(m, c);
  if (entries.length === 1) return head;
  return `${head} +${entries.length - 1}`;
}
