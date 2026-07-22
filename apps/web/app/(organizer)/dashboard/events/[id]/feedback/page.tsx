'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, MessageSquare, Star, TrendingUp } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';

interface Aggregate {
  count: number;
  ratingCount: number;
  avgRating: number | null;
  npsCount: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps: number | null;
}

interface SessionSummary extends Aggregate {
  sessionId: string;
  title: string;
}

interface FeedbackComment {
  id: string;
  sessionId: string | null;
  target: string;
  rating: number | null;
  npsScore: number | null;
  comment: string | null;
  attendeeEmail: string | null;
  createdAt: string;
}

interface FeedbackSummary {
  total: number;
  event: Aggregate;
  overall: Aggregate;
  sessions: SessionSummary[];
  comments: FeedbackComment[];
}

export default function EventFeedbackPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const [data, setData] = useState<FeedbackSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const orgId = readActiveOrgId();
    if (!orgId || !eventId) return;
    apiFetch<FeedbackSummary>(`/v1/organizations/${orgId}/events/${eventId}/feedback`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [eventId]);

  if (error) {
    return (
      <div className="rounded-2xl border border-[#FF7675]/30 bg-[#FF7675]/5 p-6 text-sm text-[#FF9090]">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center text-sm text-ink-secondary">
        Loading feedback...
      </div>
    );
  }

  return (
    <div className="space-y-8 text-ink-primary">
      <Link
        href={`/dashboard/events/${eventId}`}
        className="inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to event
      </Link>

      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Feedback</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Attendee feedback</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {data.total > 0
            ? `${data.total} response${data.total === 1 ? '' : 's'} across the event and its sessions.`
            : 'No responses yet.'}
        </p>
      </header>

      {data.total === 0 ? (
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-12 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-ink-muted" />
          <p className="mt-4 text-sm text-ink-secondary">
            Feedback appears here once the event is live or ended and attendees start
            responding from the public event page.
          </p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <HeroStat
              tone="brand"
              label="Average rating"
              value={data.overall.avgRating != null ? `${data.overall.avgRating.toFixed(1)}` : '—'}
              sublabel={
                data.overall.ratingCount > 0
                  ? `${data.overall.ratingCount} rating${data.overall.ratingCount === 1 ? '' : 's'} (out of 5)`
                  : 'No star ratings yet'
              }
              icon={Star}
            />
            <HeroStat
              tone="teal"
              label="Net Promoter Score"
              value={data.overall.nps != null ? `${data.overall.nps}` : '—'}
              sublabel={
                data.overall.npsCount > 0
                  ? `${data.overall.npsCount} NPS response${data.overall.npsCount === 1 ? '' : 's'}`
                  : 'No NPS responses yet'
              }
              icon={TrendingUp}
            />
            <HeroStat
              tone="blue"
              label="Total responses"
              value={data.total.toLocaleString()}
              sublabel={`${data.comments.length} with a written comment`}
              icon={MessageSquare}
            />
          </section>

          {data.overall.npsCount > 0 && (
            <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
              <h3 className="text-sm font-semibold text-ink-primary">NPS breakdown</h3>
              <NpsBar agg={data.overall} />
            </section>
          )}

          {data.sessions.length > 0 && (
            <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
              <h3 className="text-sm font-semibold text-ink-primary">By session</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="pb-2 pr-4 font-medium">Session</th>
                      <th className="pb-2 pr-4 font-medium">Responses</th>
                      <th className="pb-2 pr-4 font-medium">Avg rating</th>
                      <th className="pb-2 font-medium">NPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.map((s) => (
                      <tr key={s.sessionId} className="border-b border-surface-border/50">
                        <td className="py-3 pr-4 font-medium text-ink-primary">{s.title}</td>
                        <td className="py-3 pr-4 text-ink-secondary">{s.count}</td>
                        <td className="py-3 pr-4 text-ink-secondary">
                          {s.avgRating != null ? (
                            <span className="inline-flex items-center gap-1">
                              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                              {s.avgRating.toFixed(1)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 text-ink-secondary">
                          {s.nps != null ? s.nps : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.comments.length > 0 && (
            <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
              <h3 className="text-sm font-semibold text-ink-primary">Comments</h3>
              <ul className="mt-4 space-y-3">
                {data.comments.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl border border-surface-border bg-surface-deep/40 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <span className="rounded-full bg-brand-500/10 px-2 py-0.5 font-semibold text-brand-300">
                        {c.target}
                      </span>
                      {c.rating != null && (
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {c.rating}/5
                        </span>
                      )}
                      {c.npsScore != null && <span>NPS {c.npsScore}</span>}
                      <span className="ml-auto">
                        {new Date(c.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-ink-primary">{c.comment}</p>
                    {c.attendeeEmail && (
                      <p className="mt-2 text-xs text-ink-muted">{c.attendeeEmail}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ----------------------------- helpers ----------------------------- */

function HeroStat({
  tone,
  label,
  value,
  sublabel,
  icon: Icon,
}: {
  tone: 'brand' | 'teal' | 'blue';
  label: string;
  value: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const bg =
    tone === 'brand'
      ? 'bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800'
      : tone === 'teal'
        ? 'bg-gradient-to-br from-[#0EA5A5] via-[#0F8585] to-[#0B6262]'
        : 'bg-gradient-to-br from-[#3B82F6] via-[#2563EB] to-[#1D4ED8]';
  return (
    <div className={`relative overflow-hidden rounded-3xl ${bg} p-6 text-white shadow-2xl`}>
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
      <div className="relative flex items-start justify-between">
        <p className="text-sm font-medium text-white/80">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="relative mt-4 text-4xl font-bold tracking-tight sm:text-5xl">{value}</p>
      <p className="relative mt-4 text-xs text-white/70">{sublabel}</p>
    </div>
  );
}

function NpsBar({ agg }: { agg: Aggregate }) {
  const total = agg.npsCount || 1;
  const pct = (n: number) => Math.round((n / total) * 100);
  const segs = [
    { label: 'Promoters', n: agg.promoters, cls: 'bg-[#34D399]' },
    { label: 'Passives', n: agg.passives, cls: 'bg-[#FCD34D]' },
    { label: 'Detractors', n: agg.detractors, cls: 'bg-[#FF7675]' },
  ];
  return (
    <div className="mt-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-border">
        {segs.map((s) =>
          s.n > 0 ? (
            <div key={s.label} className={s.cls} style={{ width: `${pct(s.n)}%` }} />
          ) : null,
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-secondary">
        {segs.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${s.cls}`} />
            {s.label}: <span className="font-semibold text-ink-primary">{s.n}</span> ({pct(s.n)}%)
          </span>
        ))}
      </div>
    </div>
  );
}
