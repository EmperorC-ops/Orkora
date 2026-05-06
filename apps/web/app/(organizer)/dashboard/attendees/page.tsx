'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, DollarSign, Search, TicketCheck, Users } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';

interface OrgAttendeeRow {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  eventsAttended: number;
  ticketCount: number;
  totalSpentMinor: number;
  primaryCurrency: string | null;
  lastRegisteredAt: string | null;
}

interface OrgAttendeesList {
  total: number;
  take: number;
  skip: number;
  rows: OrgAttendeeRow[];
}

type SortKey = 'name' | 'events' | 'spent';

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'events', label: 'Most events' },
  { value: 'spent', label: 'Highest spend' },
  { value: 'name', label: 'A to Z' },
];

const PAGE_SIZE = 100;

export default function OrgAttendeesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [data, setData] = useState<OrgAttendeesList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sort, setSort] = useState<SortKey>('events');
  const [page, setPage] = useState(0);

  useEffect(() => {
    setOrgId(readActiveOrgId());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(0);
  }, [debouncedQ, sort]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (debouncedQ) params.set('q', debouncedQ);
    params.set('sort', sort);
    params.set('take', String(PAGE_SIZE));
    params.set('skip', String(page * PAGE_SIZE));
    apiFetch<OrgAttendeesList>(
      `/v1/organizations/${orgId}/attendees?${params.toString()}`,
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
  }, [orgId, debouncedQ, sort, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Attendees</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your audience</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            One row per person. Counts and spend roll up across every event.
          </p>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <Stat
              label="Unique attendees"
              value={data.total.toLocaleString()}
              icon={<Users className="h-4 w-4" />}
            />
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-full border border-surface-border bg-surface/40 p-1">
          {SORTS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setSort(f.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                sort === f.value
                  ? 'bg-brand-500 text-white shadow'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
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
        <SkeletonGrid />
      ) : data.rows.length === 0 ? (
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-12 text-center">
          <p className="text-base font-semibold text-ink-primary">No attendees yet.</p>
          <p className="mt-2 text-sm text-ink-secondary">
            Once people register for an event, they will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.rows.map((a) => (
              <Link
                key={a.userId}
                href={`/dashboard/attendees/${a.userId}`}
                className="group rounded-2xl border border-surface-border bg-surface/40 p-5 transition hover:border-brand-500/40 hover:bg-surface/60"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={a.fullName} url={a.avatarUrl} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold text-ink-primary">
                      {a.fullName}
                    </div>
                    <div className="truncate text-xs text-ink-muted">{a.email}</div>
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-3 gap-2">
                  <Tile
                    icon={<Calendar className="h-3.5 w-3.5" />}
                    label="Events"
                    value={a.eventsAttended.toString()}
                  />
                  <Tile
                    icon={<TicketCheck className="h-3.5 w-3.5" />}
                    label="Tickets"
                    value={a.ticketCount.toString()}
                  />
                  <Tile
                    icon={<DollarSign className="h-3.5 w-3.5" />}
                    label="Spent"
                    value={formatMoney(a.totalSpentMinor, a.primaryCurrency)}
                  />
                </dl>
                {a.lastRegisteredAt && (
                  <p className="mt-4 text-[11px] text-ink-muted">
                    Last registered {timeAgo(a.lastRegisteredAt)}
                  </p>
                )}
              </Link>
            ))}
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

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-surface-border bg-surface/40 p-5">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 animate-pulse rounded-full bg-surface-border" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-surface-border" />
              <div className="h-2.5 w-44 animate-pulse rounded bg-surface-border/70" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-12 animate-pulse rounded-lg bg-surface-border/60" />
            ))}
          </div>
        </div>
      ))}
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
    <div className="rounded-lg bg-surface-deep/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink-muted">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold text-ink-primary">{value}</div>
    </div>
  );
}

function Avatar({
  name,
  url,
  size = 'md',
}: {
  name: string;
  url: string | null;
  size?: 'md' | 'lg';
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
  const dim = size === 'lg' ? 'h-12 w-12 text-sm' : 'h-9 w-9 text-xs';
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className={`${dim} flex-none rounded-full object-cover`} />;
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
      className={`flex flex-none items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ${dim} ${palettes[idx]}`}
    >
      {initials || '?'}
    </span>
  );
}

function formatMoney(minor: number, currency: string | null): string {
  if (!currency || minor === 0) return '-';
  const major = minor / 100;
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
