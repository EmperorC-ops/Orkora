'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AdminUser, type PlatformRole } from '@/lib/admin';

const ROLE_OPTIONS: PlatformRole[] = ['none', 'support', 'superadmin'];

export default function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.users(search);
      setRows(res.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(u: AdminUser, role: PlatformRole) {
    if (role === u.platformRole) return;
    setBusy(u.id);
    setError(null);
    try {
      await adminApi.setPlatformRole(u.id, role);
      await load(q || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change role.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-ink-primary">Users</h2>
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
            placeholder="Search name or email"
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
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Orgs</th>
              <th className="px-4 py-3">Tickets</th>
              <th className="px-4 py-3">Platform role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-secondary">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-secondary">
                  No users.
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink-primary">{u.fullName}</div>
                    <div className="text-xs text-ink-muted">{u.email}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{u.membershipCount}</td>
                  <td className="px-4 py-3 text-ink-secondary">{u.registrationCount}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.platformRole}
                      disabled={busy === u.id}
                      onChange={(e) => changeRole(u, e.target.value as PlatformRole)}
                      className={`rounded-lg border border-surface-border bg-surface-deep/50 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none disabled:opacity-50 ${
                        u.platformRole === 'superadmin' ? 'text-[#FF9090]' : 'text-ink-primary'
                      }`}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
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
