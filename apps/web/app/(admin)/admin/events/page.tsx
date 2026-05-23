'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AdminEvent } from '@/lib/admin';

function fmtDate(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: tz,
  });
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-500/15 text-slate-300',
  published: 'bg-emerald-500/15 text-emerald-300',
  live: 'bg-[#FF7675]/15 text-[#FF9090]',
  ended: 'bg-amber-500/15 text-amber-300',
  archived: 'bg-slate-500/10 text-ink-muted',
};

export default function AdminEventsPage() {
  const [rows, setRows] = useState<AdminEvent[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.events(search);
      setRows(res.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-ink-primary">Events</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(q || undefined);
          }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title"
            className="rounded-lg border border-surface-border bg-surface-deep/50 px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-500 focus:outline-none"
          />
          <button className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white">
            Search
          </button>
        </form>
      </div>

      {error ? <p className="text-sm text-[#FF9090]">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-surface-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Starts</th>
              <th className="px-4 py-3">Registrations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-secondary">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-secondary">
                  No events.
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink-primary">{e.title}</div>
                    <div className="font-mono text-xs text-ink-muted">{e.code}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{e.organization.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        STATUS_STYLE[e.status] ?? 'bg-slate-500/15 text-slate-300'
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{fmtDate(e.startAt, e.timezone)}</td>
                  <td className="px-4 py-3 text-ink-secondary">{e.registrationCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
