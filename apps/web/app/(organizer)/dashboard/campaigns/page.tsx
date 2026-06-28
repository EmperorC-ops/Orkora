'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { Mail, Plus } from 'lucide-react';
import { readActiveOrgId } from '@/lib/events';
import { campaignsApi, type CampaignSummary } from '@/lib/campaigns';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  scheduled: 'bg-amber-100 text-amber-700',
  sending: 'bg-brand-100 text-brand-700',
  sent: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
  failed: 'bg-rose-100 text-rose-700',
};

export default function CampaignsListPage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const orgId = readActiveOrgId();
    if (!orgId) {
      setError('No active organization. Sign in or accept an invite first.');
      setLoading(false);
      return;
    }
    campaignsApi(orgId)
      .list()
      .then(setCampaigns)
      .catch(() => setError('Could not load campaigns.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">Campaigns</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Emails you send to your registrants. Test, schedule, track opens and clicks.
          </p>
        </div>
        <Link
          href={"/dashboard/campaigns/new" as Route}
          className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
        >
          <Plus className="h-4 w-4" /> New campaign
        </Link>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!error && loading && (
        <div className="rounded-xl border border-surface-border bg-surface/40 p-8 text-center text-sm text-ink-secondary">
          Loading...
        </div>
      )}

      {!error && !loading && campaigns.length === 0 && (
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
            <Mail className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-ink-primary">No campaigns yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-secondary">
            Send your first email to everyone registered for one of your events. Pick an audience, write the message, send.
          </p>
          <Link
            href={"/dashboard/campaigns/new" as Route}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
          >
            <Plus className="h-4 w-4" /> Create your first campaign
          </Link>
        </div>
      )}

      {!error && !loading && campaigns.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-surface-border bg-surface/40">
          <div className="hidden grid-cols-[1fr_140px_120px_120px_100px] gap-3 border-b border-surface-border px-5 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted lg:grid">
            <div>Campaign</div>
            <div>Audience</div>
            <div>Sent</div>
            <div>Open / Click</div>
            <div>Status</div>
          </div>
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/campaigns/${c.id}` as Route}
              className="block border-b border-surface-border px-5 py-4 transition last:border-b-0 hover:bg-brand-500/5"
            >
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_140px_120px_120px_100px] lg:items-center">
                <div>
                  <div className="text-sm font-semibold text-ink-primary">{c.name}</div>
                  <div className="text-xs text-ink-secondary">{c.subject}</div>
                </div>
                <div className="text-xs text-ink-secondary">
                  {c.audience?.name ?? '-'}
                  <div className="text-xs text-ink-muted">{c.audience?.cachedCount ?? 0} people</div>
                </div>
                <div className="text-xs text-ink-secondary">{c.recipientCount || '-'}</div>
                <div className="text-xs text-ink-secondary">-</div>
                <div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[c.status] ?? 'bg-slate-100 text-slate-700'}`}
                  >
                    {c.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
