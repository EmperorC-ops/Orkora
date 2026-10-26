'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Filter, Loader2, RotateCcw } from 'lucide-react';
import { apiDownload, apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';

/**
 * Insights: slice one event's registrations by date, tier, status, VIP and
 * registration-form answers, see the arrivals curve on the day, compare any
 * dimension, and export exactly what is on screen as CSV.
 */

interface Insights {
  totals: {
    registrations: number;
    tickets: number;
    checkedIn: number;
    checkInRate: number;
    vip: number;
    revenueByCurrency: Record<string, number>;
  };
  series: Array<{ key: string; count: number }>;
  hourly: boolean;
  arrivals: Array<{ key: string; count: number }>;
  breakdown: {
    groupBy: string;
    rows: Array<{ key: string; registrations: number; tickets: number; checkedIn: number }>;
  };
  timezone: string;
  truncated: boolean;
  dimensions: {
    tiers: Array<{ id: string; name: string }>;
    statuses: string[];
    fields: Array<{ id: string; label: string; options: string[] }>;
  };
}

type Range = 'all' | '24h' | '7d' | 'custom';

const select =
  'rounded-lg border border-surface-border bg-surface-deep/50 px-2.5 py-1.5 text-sm text-ink-primary focus:border-brand-500 focus:outline-none';

function money(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

export function InsightsPanel({ eventId }: { eventId: string }) {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tier, setTier] = useState('');
  const [status, setStatus] = useState('');
  const [vip, setVip] = useState('');
  const [field, setField] = useState('');
  const [value, setValue] = useState('');
  const [groupBy, setGroupBy] = useState('tier');
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setOrgId(readActiveOrgId());
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    const now = Date.now();
    if (range === '24h') p.set('from', new Date(now - 24 * 3600_000).toISOString());
    if (range === '7d') p.set('from', new Date(now - 7 * 24 * 3600_000).toISOString());
    if (range === '24h' || range === '7d') p.set('to', new Date(now).toISOString());
    if (range === 'custom') {
      if (from) p.set('from', new Date(`${from}T00:00:00`).toISOString());
      if (to) p.set('to', new Date(`${to}T23:59:59`).toISOString());
    }
    if (tier) p.set('tier', tier);
    if (status) p.set('status', status);
    if (vip) p.set('vip', vip);
    if (field && value) {
      p.set('field', field);
      p.set('value', value);
    }
    p.set('groupBy', groupBy);
    return p.toString();
  }, [range, from, to, tier, status, vip, field, value, groupBy]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      setData(
        await apiFetch<Insights>(
          `/v1/organizations/${orgId}/analytics/events/${eventId}/insights?${query}`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load insights.');
    } finally {
      setLoading(false);
    }
  }, [orgId, eventId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  function reset() {
    setRange('all');
    setFrom('');
    setTo('');
    setTier('');
    setStatus('');
    setVip('');
    setField('');
    setValue('');
    setGroupBy('tier');
  }

  async function exportCsv() {
    if (!orgId) return;
    setExporting(true);
    try {
      await apiDownload(
        `/v1/organizations/${orgId}/analytics/events/${eventId}/insights.csv?${query}`,
        'attendees.csv',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  const fieldDef = data?.dimensions.fields.find((f) => f.id === field);
  const maxSeries = Math.max(1, ...(data?.series.map((s) => s.count) ?? [1]));
  const maxArrivals = Math.max(1, ...(data?.arrivals.map((s) => s.count) ?? [1]));
  const filtered = range !== 'all' || tier || status || vip || (field && value);

  return (
    <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
            <Filter className="h-4 w-4 text-brand-300" /> Insights
          </h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            Slice registrations and check-ins. Times in {data?.timezone ?? 'the event timezone'}.
          </p>
        </div>
        <div className="flex gap-2">
          {filtered ? (
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-3 py-1.5 text-xs text-ink-secondary hover:bg-white/5">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          ) : null}
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || !data}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </button>
        </div>
      </div>

      {/* Slicers */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Registered
          <select value={range} onChange={(e) => setRange(e.target.value as Range)} className={select}>
            <option value="all">Any time</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>
        {range === 'custom' ? (
          <>
            <label className="flex flex-col gap-1 text-xs text-ink-muted">
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={select} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-muted">
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={select} />
            </label>
          </>
        ) : null}
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Tier
          <select value={tier} onChange={(e) => setTier(e.target.value)} className={select}>
            <option value="">All tiers</option>
            {data?.dimensions.tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={select}>
            <option value="">Any status</option>
            {data?.dimensions.statuses.map((s) => (
              <option key={s} value={s}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          VIP
          <select value={vip} onChange={(e) => setVip(e.target.value)} className={select}>
            <option value="">Everyone</option>
            <option value="yes">VIP only</option>
            <option value="no">Not VIP</option>
          </select>
        </label>
        {data && data.dimensions.fields.length > 0 ? (
          <>
            <label className="flex flex-col gap-1 text-xs text-ink-muted">
              Answer to
              <select
                value={field}
                onChange={(e) => {
                  setField(e.target.value);
                  setValue('');
                }}
                className={`${select} max-w-[14rem]`}
              >
                <option value="">Any question</option>
                {data.dimensions.fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            {fieldDef ? (
              <label className="flex flex-col gap-1 text-xs text-ink-muted">
                Is
                <select value={value} onChange={(e) => setValue(e.target.value)} className={`${select} max-w-[12rem]`}>
                  <option value="">Any answer</option>
                  {fieldDef.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-[#FF9090]">{error}</p> : null}
      {loading && !data ? <p className="mt-4 text-sm text-ink-secondary">Loading insights...</p> : null}

      {data ? (
        <div className={`mt-5 space-y-6 ${loading ? 'opacity-60' : ''}`}>
          {data.truncated ? (
            <p className="text-xs text-amber-200">Showing the first 10,000 registrations.</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Tile label="Registrations" value={data.totals.registrations.toLocaleString()} />
            <Tile label="Live tickets" value={data.totals.tickets.toLocaleString()} />
            <Tile label="Checked in" value={data.totals.checkedIn.toLocaleString()} />
            <Tile label="Check-in rate" value={`${data.totals.checkInRate}%`} />
            <Tile
              label="Revenue"
              value={
                Object.keys(data.totals.revenueByCurrency).length
                  ? Object.entries(data.totals.revenueByCurrency)
                      .map(([c, m]) => money(m, c))
                      .join(' + ')
                  : 'Free'
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Bars
              title={data.hourly ? 'Registrations by hour' : 'Registrations by day'}
              points={data.series}
              max={maxSeries}
              empty="No registrations in this view."
            />
            <Bars
              title="Arrivals (Check-Ins per 15 Minutes)"
              points={data.arrivals.map((a) => ({ key: a.key.slice(11) || a.key, count: a.count, full: a.key }))}
              max={maxArrivals}
              empty="No check-ins yet."
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Compare By</h4>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={select}>
                <option value="tier">Tier</option>
                <option value="status">Status</option>
                <option value="vip">VIP</option>
                {data.dimensions.fields.map((f) => (
                  <option key={f.id} value={`field:${f.id}`}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 overflow-x-auto rounded-xl border border-surface-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-3 py-2">Group</th>
                    <th className="px-3 py-2">Registrations</th>
                    <th className="px-3 py-2">Tickets</th>
                    <th className="px-3 py-2">Checked in</th>
                    <th className="px-3 py-2">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {data.breakdown.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-ink-secondary">
                        Nothing to compare in this view.
                      </td>
                    </tr>
                  ) : (
                    data.breakdown.rows.map((r) => (
                      <tr key={r.key}>
                        <td className="px-3 py-2 text-ink-primary">{r.key}</td>
                        <td className="px-3 py-2 text-ink-secondary">{r.registrations.toLocaleString()}</td>
                        <td className="px-3 py-2 text-ink-secondary">{r.tickets.toLocaleString()}</td>
                        <td className="px-3 py-2 text-ink-secondary">{r.checkedIn.toLocaleString()}</td>
                        <td className="px-3 py-2 text-ink-secondary">
                          {r.tickets ? `${Math.round((r.checkedIn / r.tickets) * 100)}%` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-deep/40 p-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-ink-primary">{value}</div>
    </div>
  );
}

function Bars({
  title,
  points,
  max,
  empty,
}: {
  title: string;
  points: Array<{ key: string; count: number; full?: string }>;
  max: number;
  empty: string;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{title}</h4>
      {points.length === 0 ? (
        <p className="mt-3 text-sm text-ink-secondary">{empty}</p>
      ) : (
        <div className="mt-3 flex h-40 items-end gap-1 overflow-x-auto">
          {points.map((p) => (
            <div key={p.full ?? p.key} className="flex min-w-[18px] flex-1 flex-col items-center justify-end" title={`${p.full ?? p.key}: ${p.count}`}>
              <div
                className="w-full rounded-t bg-brand-500/80"
                style={{ height: `${Math.max(4, Math.round((p.count / max) * 128))}px` }}
              />
              <span className="mt-1 max-w-full truncate text-[9px] text-ink-muted">{p.key.length > 5 ? p.key.slice(5) : p.key}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
