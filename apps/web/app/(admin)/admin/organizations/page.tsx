'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AdminOrg } from '@/lib/admin';

export default function AdminOrganizationsPage() {
  const [rows, setRows] = useState<AdminOrg[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.organizations(search);
      setRows(res.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load organizations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(o: AdminOrg) {
    setBusy(o.id);
    setError(null);
    try {
      if (o.status === 'suspended') await adminApi.restoreOrg(o.id);
      else await adminApi.suspendOrg(o.id);
      await load(q || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-ink-primary">Organizations</h2>
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
            placeholder="Search name or slug"
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
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Events</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3 text-right">Action</th>
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
                  No organizations.
                </td>
              </tr>
            ) : (
              rows.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink-primary">{o.name}</div>
                    <div className="text-xs text-ink-muted">
                      /{o.slug} · {o.countryCode} · {o.plan}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {o.status === 'suspended' ? (
                      <span className="rounded-full bg-[#FF7675]/15 px-2 py-0.5 text-xs text-[#FF9090]">
                        suspended
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                        active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{o.eventCount}</td>
                  <td className="px-4 py-3 text-ink-secondary">{o.memberCount}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggle(o)}
                      disabled={busy === o.id}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                        o.status === 'suspended'
                          ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                          : 'bg-[#FF7675]/15 text-[#FF9090] hover:bg-[#FF7675]/25'
                      }`}
                    >
                      {busy === o.id ? '...' : o.status === 'suspended' ? 'Restore' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
