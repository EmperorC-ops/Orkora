'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { readActiveOrgId } from '@/lib/events';
import { campaignsApi, type CampaignDetail } from '@/lib/campaigns';
import CampaignComposer from '../CampaignComposer';

/**
 * Campaign detail. The campaigns list has always linked here, but the page did
 * not exist, so every click on a campaign landed on a 404 and drafts could be
 * neither edited nor deleted.
 *
 *   - draft or scheduled: opens in the composer (edit, test, send, delete);
 *   - anything already sending or sent: a read-only summary.
 */
export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const orgId = readActiveOrgId();
    if (!orgId) {
      setError('No active organization.');
      return;
    }
    if (!id) return;
    let cancelled = false;
    campaignsApi(orgId)
      .get(id)
      .then((c) => {
        if (!cancelled) setCampaign(c);
      })
      .catch(() => {
        if (!cancelled) setError('This campaign could not be found. It may have been deleted.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div>
        <BackLink />
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div>
        <BackLink />
        <div className="mt-4 rounded-xl border border-surface-border bg-surface/40 p-8 text-center text-sm text-ink-secondary">
          Loading...
        </div>
      </div>
    );
  }

  if (campaign.status === 'draft' || campaign.status === 'scheduled') {
    return <CampaignComposer initial={campaign} />;
  }

  return <SentSummary campaign={campaign} />;
}

function BackLink() {
  return (
    <Link
      href={'/dashboard/campaigns' as Route}
      className="inline-flex items-center gap-1 text-xs text-ink-secondary transition hover:text-ink-primary"
    >
      <ArrowLeft className="h-3 w-3" /> Back to campaigns
    </Link>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Read-only view for a campaign that has already gone out (or is going). */
function SentSummary({ campaign }: { campaign: CampaignDetail }) {
  const [docStats, setDocStats] = useState<{ recipients: number; opens: number } | null>(null);
  useEffect(() => {
    const orgId = readActiveOrgId();
    if (!orgId || !campaign.documentUrl) return;
    campaignsApi(orgId)
      .documentStats(campaign.id)
      .then(setDocStats)
      .catch(() => setDocStats(null));
  }, [campaign.id, campaign.documentUrl]);

  return (
    <div>
      <BackLink />
      <header className="mt-1 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">{campaign.name}</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          This campaign has been {campaign.status === 'sending' ? 'queued and is sending' : campaign.status}. It
          can no longer be edited.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Status" value={campaign.status} />
        <Stat label="Recipients" value={campaign.recipientCount ? String(campaign.recipientCount) : '-'} />
        <Stat label="Completed" value={formatWhen(campaign.sentCompletedAt ?? campaign.sentStartedAt)} />
      </div>

      <div className="mt-6 rounded-2xl border border-surface-border bg-surface/40 p-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Subject</div>
        <div className="mt-1 text-base font-semibold text-ink-primary">{campaign.subject}</div>
        {campaign.previewText ? (
          <div className="mt-1 text-sm text-ink-secondary">{campaign.previewText}</div>
        ) : null}
        <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-muted">From</div>
        <div className="mt-1 text-sm text-ink-secondary">
          {campaign.fromName} &lt;{campaign.fromEmail}&gt;
        </div>
        {campaign.documentUrl ? (
          <>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-muted">Document</div>
            <div className="mt-1 text-sm text-ink-secondary">
              <a href={campaign.documentUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-300 underline">
                {campaign.documentName ?? 'document.pdf'}
              </a>
              {docStats ? (
                <span className="ml-2">
                  Opened by {docStats.recipients.toLocaleString()}
                  {campaign.recipientCount ? ` of ${campaign.recipientCount.toLocaleString()}` : ''} recipient
                  {docStats.recipients === 1 ? '' : 's'} ({docStats.opens.toLocaleString()} download
                  {docStats.opens === 1 ? '' : 's'} in total)
                </span>
              ) : null}
            </div>
          </>
        ) : null}
        {campaign.flyerUrl ? (
          <>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-muted">Flyer</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={campaign.flyerUrl} alt="Campaign flyer" className="mt-2 max-h-64 rounded-xl" />
          </>
        ) : null}
        <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-muted">Message</div>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-primary">
          {campaign.bodyMarkdown}
        </pre>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface/40 p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="mt-2 text-lg font-semibold capitalize text-ink-primary">{value}</div>
    </div>
  );
}
