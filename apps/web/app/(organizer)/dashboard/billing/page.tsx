'use client';

import { useEffect, useState } from 'react';
import { Download, Receipt, TrendingUp } from 'lucide-react';
import { readActiveOrgId } from '@/lib/events';
import { billingApi, formatMinor, type BillingOverview, type Trailing12Row } from '@/lib/billing';

export default function BillingPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [trailing, setTrailing] = useState<Trailing12Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = readActiveOrgId();
    if (!id) {
      setError('No active organization.');
      setLoading(false);
      return;
    }
    setOrgId(id);
    const api = billingApi(id);
    Promise.all([api.overview(), api.trailing12()])
      .then(([o, t]) => {
        setOverview(o);
        setTrailing(t);
      })
      .catch(() => setError('Could not load billing data.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-ink-secondary">Loading billing data...</div>;
  if (error) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;
  if (!overview) return null;

  const totalsByCurrency = overview.lifetime.revenue.map((row) => {
    const fee = overview.lifetime.notionalFee.find((f) => f.currency === row.currency);
    const refund = overview.lifetime.refunds.find((r) => r.currency === row.currency);
    return {
      currency: row.currency,
      revenue: row.totalMinor,
      notionalFee: fee?.totalMinor ?? '0',
      refunded: refund?.totalMinor ?? '0',
    };
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">Billing</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Your plan, lifetime revenue, and what Orkora would take under the post-beta pricing.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Current plan</div>
          <div className="mt-2 text-xl font-semibold capitalize text-ink-primary">{overview.plan.name}</div>
          <div className="mt-1 text-xs text-ink-secondary">
            Platform fee: {overview.plan.platformFeePercent}% (advisory only during private beta)
          </div>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Paid orders</div>
          <div className="mt-2 text-xl font-semibold text-ink-primary">{overview.lifetime.paidOrderCount.toLocaleString()}</div>
          <div className="mt-1 text-xs text-ink-secondary">Lifetime, across every event</div>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Refunded orders</div>
          <div className="mt-2 text-xl font-semibold text-ink-primary">{overview.lifetime.refundedOrderCount.toLocaleString()}</div>
          <div className="mt-1 text-xs text-ink-secondary">Settled refunds only</div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink-primary">Revenue by currency</h2>
            <p className="text-xs text-ink-secondary">Lifetime paid GMV, with the notional Orkora fee and refunds for comparison.</p>
          </div>
          {orgId && (
            <a
              href={billingApi(orgId).csvUrl()}
              className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface/40 px-4 py-2 text-xs font-semibold text-ink-primary transition hover:bg-white/5"
            >
              <Download className="h-3.5 w-3.5" /> Export orders CSV
            </a>
          )}
        </div>
        <div className="overflow-hidden rounded-2xl border border-surface-border bg-surface/40">
          <table className="w-full text-sm">
            <thead className="bg-surface-deep/40 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-4 py-3 text-left">Currency</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">Notional fee</th>
                <th className="px-4 py-3 text-right">Refunded</th>
              </tr>
            </thead>
            <tbody>
              {totalsByCurrency.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-ink-secondary">
                    No paid orders yet. Sell your first ticket and revenue will surface here.
                  </td>
                </tr>
              )}
              {totalsByCurrency.map((row) => (
                <tr key={row.currency} className="border-t border-surface-border">
                  <td className="px-4 py-3 font-semibold text-ink-primary">{row.currency}</td>
                  <td className="px-4 py-3 text-right text-ink-primary">{formatMinor(row.revenue, row.currency)}</td>
                  <td className="px-4 py-3 text-right text-ink-secondary">{formatMinor(row.notionalFee, row.currency)}</td>
                  <td className="px-4 py-3 text-right text-ink-secondary">{formatMinor(row.refunded, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {trailing.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink-primary">
                <TrendingUp className="h-4 w-4 text-brand-300" /> Last 12 months
              </h2>
              <p className="text-xs text-ink-secondary">Monthly paid revenue grouped by currency.</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-surface-border bg-surface/40">
            <table className="w-full text-sm">
              <thead className="bg-surface-deep/40 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Month</th>
                  <th className="px-4 py-3 text-left">Currency</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {trailing
                  .slice()
                  .sort((a, b) => (a.month < b.month ? 1 : -1))
                  .map((row, i) => (
                    <tr key={`${row.month}-${row.currency}-${i}`} className="border-t border-surface-border">
                      <td className="px-4 py-3 text-ink-primary">{row.month}</td>
                      <td className="px-4 py-3 text-ink-secondary">{row.currency}</td>
                      <td className="px-4 py-3 text-right text-ink-primary">{formatMinor(row.totalMinor, row.currency)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink-primary">
          <Receipt className="h-4 w-4 text-brand-300" /> About platform fees
        </h2>
        <ul className="mt-3 space-y-2 text-xs text-ink-secondary">
          {overview.plan.notes.map((n) => (
            <li key={n}>- {n}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
