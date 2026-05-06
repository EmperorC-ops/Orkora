'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, TicketCheck, Users } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';

interface OrgRegistrationRow {
  id: string;
  status: string;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
  };
  event: { id: string; title: string; code: string };
  tickets: Array<{
    id: string;
    code: string;
    status: string;
    tier: { id: string; name: string };
  }>;
}

interface OrgRegistrationsList {
  total: number;
  take: number;
  skip: number;
  rows: OrgRegistrationRow[];
}

interface OrgEventStub {
  id: string;
  title: string;
  code: string;
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAGE_SIZE = 100;

export default function OrgRegistrationsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [data, setData] = useState<OrgRegistrationsList | null>(null);
  const [events, setEvents] = useState<OrgEventStub[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [eventId, setEventId] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    setOrgId(readActiveOrgId());
  }, []);

  // Debounce the search box so we don't hammer the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Reset pagination on any filter change.
  useEffect(() => {
    setPage(0);
  }, [status, eventId, debouncedQ]);

  // One-time load of the events list for the per-event filter.
  useEffect(() => {
    if (!orgId) return;
    apiFetch<OrgEventStub[]>(`/v1/organizations/${orgId}/events`)
      .then((rows) =>
        setEvents(rows.map((r) => ({ id: r.id, title: r.title, code: r.code }))),
      )
      .catch(() => undefined);
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (debouncedQ) params.set('q', debouncedQ);
    if (eventId) params.set('eventId', eventId);
    params.set('take', String(PAGE_SIZE));
    params.set('skip', String(page * PAGE_SIZE));
    apiFetch<OrgRegistrationsList>(
      `/v1/organizations/${orgId}/registrations?${params.toString()}`,
    )
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, status, eventId, debouncedQ, page]);

  const totals = useMemo(() => {
    if (!data) return null;
    const ticketCount = data.rows.reduce((s, r) => s + r.tickets.length, 0);
    return { total: data.total, ticketCount };
  }, [data]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Registrations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Across every event</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            One queue covering registrations from every event you run.
          </p>
        </div>
        {totals && (
          <div className="flex flex-wrap items-center gap-2">
            <Stat
              label="Registrations"
              value={totals.total.toLocaleString()}
              icon={<Users className="h-4 w-4" />}
            />
            <Stat
              label="Tickets issued"
              value={totals.ticketCount.toLocaleString()}
              icon={<TicketCheck className="h-4 w-4" />}
            />
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-full border border-surface-border bg-surface/40 p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              type="button"
              onClick={() => setStatus(f.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                status === f.value
                  ? 'bg-brand-500 text-white shadow'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="rounded-full border border-surface-border bg-surface/40 px-4 py-1.5 text-sm text-ink-primary outline-none"
        >
          <option value="">All events</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} ({e.code})
            </option>
          ))}
        </select>
        <label className="flex flex-1 items-center gap-2 rounded-full border border-surface-border bg-surface/40 px-4 py-1.5">
          <Search className="h-4 w-4 text-ink-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
            className="w-full bg-transparent text-sm text-ink-primary placeholder-ink-muted outline-none"
          />
        </label>
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#FF7675]/30 bg-[#FF7675]/5 p-6 text-sm text-[#FF9090]">
          {error}
        </div>
      ) : !data ? (
        <SkeletonTable />
      ) : data.rows.length === 0 ? (
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-12 text-center">
          <p className="text-base font-semibold text-ink-primary">No registrations match.</p>
          <p className="mt-2 text-sm text-ink-secondary">
            Try clearing the filters or wait for new attendees to register.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Attendee</th>
                  <th className="px-5 py-3 font-semibold">Event</th>
                  <th className="px-5 py-3 font-semibold">Tickets</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-surface/40">
                {data.rows.map((r) => (
                  <tr key={r.id} className="transition hover:bg-surface/60">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.user.fullName} url={r.user.avatarUrl} />
                        <div>
                          <Link
                            href={`/dashboard/attendees/${r.user.id}`}
                            className="font-semibold text-ink-primary transition hover:text-brand-300"
                          >
                            {r.user.fullName}
                          </Link>
                          <div className="text-[11px] text-ink-muted">{r.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/dashboard/events/${r.event.id}`}
                        className="font-semibold text-ink-secondary transition hover:text-ink-primary"
                      >
                        {r.event.title}
                      </Link>
                      <div className="font-mono text-[10px] text-ink-muted">{r.event.code}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-brand-300">
                        {r.tickets.length} ticket{r.tickets.length === 1 ? '' : 's'}
                        {r.tickets[0]?.tier.name ? ` · ${r.tickets[0].tier.name}` : ''}
                      </span>
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-ink-secondary">
              <span>
                Page {page + 1} of {totalPages} · {data.total.toLocaleString()} total
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-full border border-surface-border bg-surface/40 px-3 py-1.5 font-semibold text-ink-primary disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page + 1 >= totalPages}
                  className="rounded-full border border-surface-border bg-surface/40 px-3 py-1.5 font-semibold text-ink-primary disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="overflow-hidden rounded-2xl border border-surface-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
          <tr>
            <th className="px-5 py-3 font-semibold">Attendee</th>
            <th className="px-5 py-3 font-semibold">Event</th>
            <th className="px-5 py-3 font-semibold">Tickets</th>
            <th className="px-5 py-3 font-semibold">Status</th>
            <th className="px-5 py-3 font-semibold">Registered</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border bg-surface/40">
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i}>
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 flex-none animate-pulse rounded-full bg-surface-border" />
                  <div className="space-y-2">
                    <div className="h-3 w-32 animate-pulse rounded bg-surface-border" />
                    <div className="h-2.5 w-40 animate-pulse rounded bg-surface-border/70" />
                  </div>
                </div>
              </td>
              <td className="px-5 py-4">
                <div className="space-y-1">
                  <div className="h-3 w-28 animate-pulse rounded bg-surface-border" />
                  <div className="h-2.5 w-16 animate-pulse rounded bg-surface-border/70" />
                </div>
              </td>
              <td className="px-5 py-4">
                <div className="h-5 w-20 animate-pulse rounded-full bg-surface-border" />
              </td>
              <td className="px-5 py-4">
                <div className="h-5 w-20 animate-pulse rounded-full bg-surface-border" />
              </td>
              <td className="px-5 py-4">
                <div className="h-3 w-16 animate-pulse rounded bg-surface-border" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface/40 px-4 py-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
        {icon}
      </span>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</div>
        <div className="text-sm font-semibold text-ink-primary">{value}</div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'confirmed'
      ? 'bg-[#00C896]/15 text-[#00C896]'
      : status === 'pending'
        ? 'bg-[#FF7675]/15 text-[#FF9090]'
        : 'bg-surface-border text-ink-muted';
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
    return (
      <img
        src={url}
        alt={name}
        className="h-9 w-9 flex-none rounded-full object-cover"
      />
    );
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
      className={`flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white ${palettes[idx]}`}
    >
      {initials || '?'}
    </span>
  );
}
