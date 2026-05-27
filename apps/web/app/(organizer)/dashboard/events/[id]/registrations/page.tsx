'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Search, TicketCheck, Users } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';

interface RegistrationRow {
  id: string;
  status: string;
  createdAt: string;
  user: { id: string; fullName: string; email: string; avatarUrl?: string | null };
  tickets: Array<{
    id: string;
    code: string;
    holderName: string;
    holderEmail: string;
    status: string;
    tier: { id: string; name: string };
  }>;
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function OrganizerRegistrationsPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const [orgId, setOrgId] = useState<string | null>(null);
  const [rows, setRows] = useState<RegistrationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [q, setQ] = useState<string>('');

  useEffect(() => {
    setOrgId(readActiveOrgId());
  }, []);

  useEffect(() => {
    if (!orgId || !eventId) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    apiFetch<RegistrationRow[]>(
      `/v1/organizations/${orgId}/events/${eventId}/registrations${suffix}`,
    )
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, eventId, status, q]);

  const totals = useMemo(() => {
    if (!rows) return null;
    const confirmed = rows.filter((r) => r.status === 'confirmed').length;
    const pending = rows.filter((r) => r.status === 'pending').length;
    const ticketCount = rows.reduce((sum, r) => sum + r.tickets.length, 0);
    return { total: rows.length, confirmed, pending, ticketCount };
  }, [rows]);

  return (
    <div className="space-y-8">
      <Link
        href={`/dashboard/events/${eventId}`}
        className="inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to event
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Registrations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Who is coming</h1>
        </div>
        {totals && (
          <div className="flex flex-wrap items-center gap-2">
            <Stat label="Registrations" value={String(totals.total)} icon={<Users className="h-4 w-4" />} />
            <Stat label="Tickets issued" value={String(totals.ticketCount)} icon={<TicketCheck className="h-4 w-4" />} />
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
      ) : !rows ? (
        <div className="overflow-x-auto rounded-2xl border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Attendee</th>
                <th className="px-5 py-3 font-semibold">Tier</th>
                <th className="px-5 py-3 font-semibold">Tickets</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border bg-surface/40">
              {Array.from({ length: 6 }).map((_, i) => (
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
                    <div className="h-3 w-20 animate-pulse rounded bg-surface-border" />
                  </td>
                  <td className="px-5 py-4">
                    <div className="h-5 w-16 animate-pulse rounded-full bg-surface-border" />
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
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-12 text-center">
          <p className="text-base font-semibold text-ink-primary">No registrations yet.</p>
          <p className="mt-2 text-sm text-ink-secondary">
            When attendees register, they will appear here in real time.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Attendee</th>
                <th className="px-5 py-3 font-semibold">Tier</th>
                <th className="px-5 py-3 font-semibold">Tickets</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border bg-surface/40">
              {rows.map((r) => (
                <tr key={r.id} className="transition hover:bg-surface/60">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.user.fullName} url={r.user.avatarUrl ?? null} />
                      <div>
                        <div className="font-semibold text-ink-primary">{r.user.fullName}</div>
                        <div className="text-[11px] text-ink-muted">{r.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-ink-secondary">
                    {r.tickets.map((t) => t.tier.name).join(', ') || '-'}
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-brand-300">
                      {r.tickets.length} ticket{r.tickets.length === 1 ? '' : 's'}
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
      )}
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
