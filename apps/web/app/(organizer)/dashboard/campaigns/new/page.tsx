'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Mail, Send } from 'lucide-react';
import { readActiveOrgId } from '@/lib/events';
import { campaignsApi, type AudienceSummary } from '@/lib/campaigns';
import { eventsApi, type OrganizerEventSummary } from '@/lib/events';

export default function NewCampaignPage() {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [events, setEvents] = useState<OrganizerEventSummary[]>([]);
  const [audiences, setAudiences] = useState<AudienceSummary[]>([]);
  const [eventId, setEventId] = useState<string>('');
  const [audienceId, setAudienceId] = useState<string>('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [bodyMarkdown, setBodyMarkdown] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const id = readActiveOrgId();
    if (!id) {
      setError('No active organization.');
      return;
    }
    setOrgId(id);
    eventsApi(id).list().then(setEvents).catch(() => {});
    campaignsApi(id).listAudiences().then(setAudiences).catch(() => {});
  }, []);

  const api = useMemo(() => (orgId ? campaignsApi(orgId) : null), [orgId]);

  async function ensureAudience(): Promise<string> {
    if (audienceId) return audienceId;
    if (!api) throw new Error('No api');
    if (!eventId) throw new Error('Pick an event first so we can build the audience');
    const audience = await api.createAudience({
      name: `All registrations for ${events.find((e) => e.id === eventId)?.title ?? 'event'}`,
      kind: 'smart',
      smartKey: 'all-registrations',
      eventId,
    });
    setAudiences((prev) => [...prev, audience]);
    setAudienceId(audience.id);
    return audience.id;
  }

  async function handleTestSend() {
    if (!api) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const aid = await ensureAudience();
      const campaign = await api.create({
        name: name || 'Untitled campaign',
        subject,
        previewText: previewText || undefined,
        bodyMarkdown,
        fromName,
        fromEmail,
        audienceId: aid,
        eventId: eventId || undefined,
      });
      await api.testSend(campaign.id, testEmail);
      setSuccess(`Test sent to ${testEmail}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send test.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendNow() {
    if (!api) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const aid = await ensureAudience();
      const campaign = await api.create({
        name: name || 'Untitled campaign',
        subject,
        previewText: previewText || undefined,
        bodyMarkdown,
        fromName,
        fromEmail,
        audienceId: aid,
        eventId: eventId || undefined,
      });
      const result = await api.send(campaign.id);
      setSuccess(`Sent to ${result.recipientCount} recipients.`);
      setTimeout(() => router.push('/dashboard/campaigns' as never), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <Link
            href={"/dashboard/campaigns" as Route}
            className="inline-flex items-center gap-1 text-xs text-ink-secondary transition hover:text-ink-primary"
          >
            <ArrowLeft className="h-3 w-3" /> Back to campaigns
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-primary">New campaign</h1>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Event
            </label>
            <select
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value);
                setAudienceId('');
              }}
              className="w-full rounded-xl border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm text-ink-primary"
            >
              <option value="">Pick an event...</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Audience
            </label>
            <div className="rounded-xl border border-surface-border bg-surface/40 p-3">
              <div className="text-sm font-semibold text-ink-primary">
                {eventId ? `All registrations for this event` : 'Pick an event above'}
              </div>
              <div className="mt-1 text-xs text-ink-secondary">
                {eventId
                  ? 'Slice A: every registered attendee for the selected event.'
                  : 'Smart segments + custom builder ship in Slice B.'}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
              From
            </label>
            <input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Sender name"
              className="mb-2 w-full rounded-xl border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm text-ink-primary placeholder-ink-muted"
            />
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="hello@yourdomain.com"
              className="w-full rounded-xl border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm text-ink-primary placeholder-ink-muted"
            />
            <p className="mt-1 text-xs text-ink-muted">
              The sender domain must be authenticated on Postmark (SPF + DKIM).
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Test send
            </label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@your-org.com"
              className="mb-2 w-full rounded-xl border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm text-ink-primary placeholder-ink-muted"
            />
            <button
              type="button"
              onClick={handleTestSend}
              disabled={busy || !subject || !bodyMarkdown || !testEmail || !fromEmail || !fromName}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-surface-border bg-surface/40 px-3 py-2 text-sm font-semibold text-ink-primary transition hover:bg-white/5 disabled:opacity-50"
            >
              <Mail className="h-4 w-4" /> Send test
            </button>
          </div>
        </aside>

        <main>
          <div className="rounded-2xl border border-surface-border bg-surface/40 p-6">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Campaign name (internal label)"
              className="mb-4 w-full border-0 bg-transparent text-base font-medium text-ink-primary outline-none placeholder-ink-muted"
            />
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="mb-2 w-full border-0 bg-transparent text-lg font-semibold text-ink-primary outline-none placeholder-ink-muted"
            />
            <input
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Preview text (shown after subject in the inbox)"
              className="mb-4 w-full border-0 border-b border-surface-border bg-transparent pb-3 text-sm text-ink-secondary outline-none placeholder-ink-muted"
            />
            <textarea
              value={bodyMarkdown}
              onChange={(e) => setBodyMarkdown(e.target.value)}
              placeholder={'Write your email here.\n\nMarkdown supported: **bold**, *italic*, [links](https://...), lists.\n\nTokens: {{first_name}}, {{email}}'}
              rows={14}
              className="w-full rounded-xl border border-surface-border bg-surface-deep/60 px-4 py-3 text-sm leading-relaxed text-ink-primary placeholder-ink-muted"
            />
            <div className="mt-2 text-xs text-ink-muted">
              Body is markdown. We escape HTML to prevent injection.
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-3">
            <Link
              href={"/dashboard/campaigns" as Route}
              className="rounded-full border border-surface-border bg-surface/40 px-5 py-2.5 text-sm font-semibold text-ink-primary transition hover:bg-white/5"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={handleSendNow}
              disabled={busy || !subject || !bodyMarkdown || !fromEmail || !fromName || !eventId}
              className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-95 disabled:opacity-50"
            >
              {busy ? 'Sending...' : (
                <>
                  Send now <Send className="h-4 w-4" />
                </>
              )}
              {!busy && <ArrowRight className="hidden" />}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
