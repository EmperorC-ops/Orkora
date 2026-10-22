'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adminApi,
  type AdminUser,
  type PlatformRole,
  type UserSegment,
  type UserSort,
} from '@/lib/admin';

const ROLE_OPTIONS: PlatformRole[] = ['none', 'support', 'superadmin'];
const PAGE_SIZE = 50;

/** Tabs across the top. Counts come from the API and follow the search term. */
const SEGMENTS: Array<{ id: UserSegment; label: string; hint: string }> = [
  { id: 'all', label: 'All', hint: 'Everyone with an Orkora account.' },
  {
    id: 'organizers',
    label: 'Organizers',
    hint: 'Belong to at least one organization (owners, admins, organizers, staff). Some also hold tickets.',
  },
  {
    id: 'ticket_holders',
    label: 'Ticket holders',
    hint: 'Registered for at least one event and belong to no organization.',
  },
  {
    id: 'inactive',
    label: 'No activity',
    hint: 'No organization and no registration. Often test or abandoned sign-ups.',
  },
  { id: 'platform', label: 'Platform team', hint: 'Orkora support and super admins.' },
];

const SORTS: Array<{ id: UserSort; label: string }> = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'last_login', label: 'Last signed in' },
  { id: 'name', label: 'Name (A to Z)' },
];

const KIND_BADGE: Record<NonNullable<AdminUser['kind']>, { label: string; cls: string }> = {
  platform: { label: 'Platform', cls: 'bg-[#FF7675]/15 text-[#FF9090]' },
  organizer: { label: 'Organizer', cls: 'bg-brand-500/15 text-brand-300' },
  ticket_holder: { label: 'Ticket holder', cls: 'bg-[#00C896]/15 text-[#34D399]' },
  inactive: { label: 'No activity', cls: 'bg-surface/80 text-ink-muted' },
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<UserSegment, number>>>({});
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [segment, setSegment] = useState<UserSegment>('all');
  const [sort, setSort] = useState<UserSort>('newest');
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.users(appliedQ || undefined, {
        segment,
        sort,
        skip,
        take: PAGE_SIZE,
      });
      setRows(res.rows);
      setTotal(res.total);
      setCounts(res.counts ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [appliedQ, segment, sort, skip]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(u: AdminUser, role: PlatformRole) {
    if (role === u.platformRole) return;
    setBusy(u.id);
    setError(null);
    try {
      await adminApi.setPlatformRole(u.id, role);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change role.');
    } finally {
      setBusy(null);
    }
  }

  const activeHint = SEGMENTS.find((s) => s.id === segment)?.hint;
  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(skip + rows.length, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-ink-primary">Users</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSkip(0);
            setAppliedQ(q.trim());
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {SEGMENTS.map((s) => {
            const active = s.id === segment;
            const n = counts[s.id];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSegment(s.id);
                  setSkip(0);
                }}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'border-brand-500 bg-brand-500/15 text-ink-primary'
                    : 'border-surface-border text-ink-secondary hover:bg-surface/60'
                }`}
              >
                {s.label}
                {typeof n === 'number' ? (
                  <span className={`ml-1.5 text-xs ${active ? 'text-brand-300' : 'text-ink-muted'}`}>
                    {n.toLocaleString()}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          Sort
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as UserSort);
              setSkip(0);
            }}
            className="rounded-lg border border-surface-border bg-surface-deep/50 px-3 py-1.5 text-sm text-ink-primary focus:border-brand-500 focus:outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {activeHint ? <p className="-mt-2 text-xs text-ink-muted">{activeHint}</p> : null}
      {error ? <p className="text-sm text-[#FF9090]">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-surface-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Organizations</th>
              <th className="px-4 py-3">Tickets</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Last sign-in</th>
              <th className="px-4 py-3">Platform role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-ink-secondary">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-ink-secondary">
                  No users in this view.
                </td>
              </tr>
            ) : (
              rows.map((u) => {
                const badge = u.kind ? KIND_BADGE[u.kind] : null;
                const orgs = u.organizations ?? [];
                const moreOrgs = u.membershipCount - orgs.length;
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink-primary">{u.fullName}</div>
                      <div className="text-xs text-ink-muted">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {badge ? (
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">
                      {orgs.length === 0 ? (
                        <span className="text-ink-muted">None</span>
                      ) : (
                        <div className="space-y-0.5">
                          {orgs.map((o, i) => (
                            <div key={`${o.name}-${i}`} className="text-xs">
                              <span className="text-ink-primary">{o.name}</span>{' '}
                              <span className="text-ink-muted">({o.role})</span>
                            </div>
                          ))}
                          {moreOrgs > 0 ? (
                            <div className="text-xs text-ink-muted">+{moreOrgs} more</div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">{u.registrationCount}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-secondary">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-secondary">
                      {formatDate(u.lastLoginAt)}
                    </td>
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
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-ink-secondary">
        <span>
          {total === 0 ? 'No results' : `Showing ${from.toLocaleString()} to ${to.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={skip === 0 || loading}
            onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
            className="rounded-lg border border-surface-border px-3 py-1.5 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={skip + rows.length >= total || loading}
            onClick={() => setSkip(skip + PAGE_SIZE)}
            className="rounded-lg border border-surface-border px-3 py-1.5 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
