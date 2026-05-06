'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Calendar, Plus, Search } from 'lucide-react';
import {
  eventsApi,
  formatEventDateRange,
  readActiveOrgId,
  type EventStatus,
  type OrganizerEventSummary,
} from '@/lib/events';

const FILTERS: Array<{ label: string; value: EventStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Drafts', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Archived', value: 'archived' },
];

const STATUS_STYLES: Record<EventStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  published: 'bg-emerald-100 text-emerald-700',
  live: 'bg-rose-100 text-rose-700',
  ended: 'bg-amber-100 text-amber-700',
  archived: 'bg-slate-100 text-slate-500',
};

export default function EventsListPage() {
  const [events, setEvents] = useState<OrganizerEventSummary[]>([]);
  const [filter, setFilter] = useState<EventStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const orgId = readActiveOrgId();
    if (!orgId) {
      setError('No active organization. Sign in or accept an invite first.');
      setLoading(false);
      return;
    }
    setLoading(true);
    eventsApi(orgId)
      .list(filter === 'all' ? undefined : filter)
      .then(setEvents)
      .catch(() => setError('Could not load events.'))
      .finally(() => setLoading(false));
  }, [filter]);

  const filtered = events.filter((e) =>
    e.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Events</h2>
          <p className="text-sm text-slate-500">Plan, publish, and manage every event you run.</p>
        </div>
        <Link
          href="/dashboard/events/new"
          className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800"
        >
          <Plus className="h-4 w-4" /> New event
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                filter === f.value
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events"
            className="w-full rounded-full border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 sm:w-72"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((event) => (
            <Link
              key={event.id}
              href={`/dashboard/events/${event.id}`}
              className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="h-28 w-full bg-brand-gradient">
                {event.bannerUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.bannerUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 font-semibold text-slate-900 group-hover:text-brand-700">
                    {event.title}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[event.status]}`}
                  >
                    {event.status}
                  </span>
                </div>
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatEventDateRange(event.startAt, event.endAt)}
                </p>
                <p className="text-xs text-slate-400">Code: {event.code}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EventCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="h-28 w-full animate-pulse bg-slate-100" />
      <div className="space-y-3 p-4">
        <div className="h-5 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
      <Calendar className="mb-3 h-10 w-10 text-slate-400" />
      <h3 className="font-semibold text-slate-900">No events yet</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Spin up your first event in under a minute. You can save it as a draft and publish when ready.
      </p>
      <Link
        href="/dashboard/events/new"
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-700 px-4 py-2 text-sm font-semibold text-white"
      >
        <Plus className="h-4 w-4" /> Create event
      </Link>
    </div>
  );
}
