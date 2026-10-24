'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Mail, Save, Send, Trash2 } from 'lucide-react';
import { readActiveOrgId } from '@/lib/events';
import { apiFetch } from '@/lib/auth';
import { campaignsApi, type AudienceSummary, type CampaignDetail } from '@/lib/campaigns';
import { eventsApi, type OrganizerEventSummary } from '@/lib/events';
import { ImageUpload } from '@/components/image-upload';
import { DocumentUpload, type UploadedDocument } from '@/components/document-upload';

/**
 * Campaign composer, shared by "New campaign" and "Edit campaign".
 *
 * A campaign is created ONCE, the first time it is saved, test-sent or sent;
 * after that every action updates the same draft. Previously every "Send test"
 * created a brand-new campaign, which is how organizers ended up with piles of
 * drafts they could not open (there was no edit page) or delete.
 *
 * After the first save on /new, the address bar switches to the draft's own
 * URL (without remounting, so nothing typed is lost), so a refresh or the back
 * button reopens the same draft instead of starting another one.
 */
export default function CampaignComposer({ initial }: { initial?: CampaignDetail | null }) {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(initial?.id ?? null);
  const [events, setEvents] = useState<OrganizerEventSummary[]>([]);
  const [, setAudiences] = useState<AudienceSummary[]>([]);
  const [eventId, setEventId] = useState<string>(initial?.eventId ?? '');
  const [audienceId, setAudienceId] = useState<string>(initial?.audienceId ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [previewText, setPreviewText] = useState(initial?.previewText ?? '');
  const [bodyMarkdown, setBodyMarkdown] = useState(initial?.bodyMarkdown ?? '');
  // Optional flyer image, shown inline at the top of the email with a
  // "Download flyer" button. Images only; PDFs must be exported first.
  const [flyerUrl, setFlyerUrl] = useState<string | null>(initial?.flyerUrl ?? null);
  // Optional PDF (newsletter), linked from the email with a Download button.
  const [pdfDoc, setPdfDoc] = useState<UploadedDocument | null>(
    initial?.documentUrl
      ? {
          url: initial.documentUrl,
          name: initial.documentName ?? 'document.pdf',
          sizeBytes: initial.documentSizeBytes ?? null,
        }
      : null,
  );
  // Only send the document on save when it changed, so the API does not
  // re-read the stored file on every draft save.
  const [documentDirty, setDocumentDirty] = useState(false);
  // Sender defaults so the Send-test / Send buttons are usable immediately.
  // fromEmail defaults to the platform's verified Postmark sender; fromName is
  // backfilled with the organisation's name once it loads.
  const [fromName, setFromName] = useState(initial?.fromName ?? '');
  const [fromEmail, setFromEmail] = useState(initial?.fromEmail ?? 'no-reply@orkora.events');
  const [testEmail, setTestEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isEdit = Boolean(campaignId);

  useEffect(() => {
    const id = readActiveOrgId();
    if (!id) {
      setError('No active organization.');
      return;
    }
    setOrgId(id);
    eventsApi(id).list().then(setEvents).catch(() => {});
    campaignsApi(id).listAudiences().then(setAudiences).catch(() => {});
    // Backfill the sender name with the organisation name so the send buttons
    // are active out of the box. Best-effort; the organiser can override.
    apiFetch<{ name?: string }>(`/v1/organizations/${id}`)
      .then((org) => {
        if (org?.name) setFromName((prev) => prev || org.name!);
      })
      .catch(() => {
        setFromName((prev) => prev || 'Orkora');
      });
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

  /**
   * Create the draft the first time, update it every time after. Returns the
   * campaign id so test-send and send act on this one draft.
   */
  async function saveDraft(): Promise<string> {
    if (!api) throw new Error('No api');
    const aid = await ensureAudience();
    if (!campaignId) {
      const created = await api.create({
        name: name || 'Untitled campaign',
        subject,
        previewText: previewText || undefined,
        bodyMarkdown,
        fromName,
        fromEmail,
        audienceId: aid,
        eventId: eventId || undefined,
        flyerUrl: flyerUrl ?? undefined,
        ...(pdfDoc ? { documentUrl: pdfDoc.url, documentName: pdfDoc.name } : {}),
      });
      setDocumentDirty(false);
      setCampaignId(created.id);
      // Point the address bar at the draft without remounting the page.
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `/dashboard/campaigns/${created.id}`);
      }
      return created.id;
    }
    await api.patch(campaignId, {
      name: name || 'Untitled campaign',
      subject,
      previewText,
      bodyMarkdown,
      fromName,
      fromEmail,
      audienceId: aid,
      ...(eventId ? { eventId } : {}),
      // null clears a removed flyer.
      flyerUrl,
      // null clears a removed document; only sent when it changed.
      ...(documentDirty
        ? pdfDoc
          ? { documentUrl: pdfDoc.url, documentName: pdfDoc.name }
          : { documentUrl: null }
        : {}),
    });
    setDocumentDirty(false);
    return campaignId;
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  function handleSave() {
    void run(async () => {
      await saveDraft();
      setSuccess('Draft saved.');
    }, 'Could not save the draft.');
  }

  function handleTestSend() {
    void run(async () => {
      const id = await saveDraft();
      if (!api) return;
      await api.testSend(id, testEmail);
      setSuccess(`Test sent to ${testEmail}. Your draft was saved too.`);
    }, 'Could not send test.');
  }

  function handleSendNow() {
    const eventTitle = events.find((e) => e.id === eventId)?.title ?? 'this event';
    if (
      !window.confirm(
        `Send this campaign now to everyone registered for ${eventTitle}? This cannot be undone.`,
      )
    ) {
      return;
    }
    void run(async () => {
      const id = await saveDraft();
      if (!api) return;
      const result = await api.send(id);
      setSuccess(`Sent to ${result.recipientCount} recipients.`);
      setTimeout(() => router.push('/dashboard/campaigns' as never), 1200);
    }, 'Could not send.');
  }

  function handleDelete() {
    if (!campaignId || !api) return;
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    void run(async () => {
      await api.remove(campaignId);
      router.push('/dashboard/campaigns' as never);
    }, 'Could not delete the draft.');
  }

  const canSave = Boolean(subject && bodyMarkdown && fromEmail && fromName && (eventId || audienceId));

  return (
    <div>
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <Link
            href={'/dashboard/campaigns' as Route}
            className="inline-flex items-center gap-1 text-xs text-ink-secondary transition hover:text-ink-primary"
          >
            <ArrowLeft className="h-3 w-3" /> Back to campaigns
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-primary">
            {isEdit ? 'Edit campaign' : 'New campaign'}
          </h1>
          {isEdit ? (
            <p className="mt-1 text-xs text-ink-muted">Draft. Changes are saved when you save, test, or send.</p>
          ) : null}
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
                {eventId ? 'All registrations for this event' : 'Pick an event above'}
              </div>
              <div className="mt-1 text-xs text-ink-secondary">
                {eventId
                  ? 'Every registered attendee for the selected event.'
                  : 'The audience is built from the event you pick.'}
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
              disabled={busy || !canSave || !testEmail}
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
            <div className="mb-4">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Flyer (optional)
              </span>
              <div className="max-w-[240px]">
                <ImageUpload kind="campaign_flyer" value={flyerUrl} onChange={setFlyerUrl} />
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Shown at the top of the email with a Download flyer button.
              </p>
            </div>
            <div className="mb-4">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Document (optional)
              </span>
              <div className="max-w-md">
                <DocumentUpload
                  value={pdfDoc}
                  onChange={(d) => {
                    setPdfDoc(d);
                    setDocumentDirty(true);
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                A PDF such as a newsletter or programme, up to 10 MB. Recipients get a Download PDF
                button, and you can see how many opened it after sending.
              </p>
            </div>
            <textarea
              value={bodyMarkdown}
              onChange={(e) => setBodyMarkdown(e.target.value)}
              placeholder={'Write your email here.\n\nMarkdown supported: **bold**, *italic*, [links](https://...), lists.\n\nTokens: {{first_name}}, {{email}}'}
              rows={14}
              className="w-full rounded-xl border border-surface-border bg-surface-deep/60 px-4 py-3 text-sm leading-relaxed text-ink-primary placeholder-ink-muted"
            />
            <div className="mt-2 text-xs text-ink-muted">
              Body is markdown. We escape HTML to prevent injection. Tokens such as{' '}
              <code>{'{{first_name}}'}</code>, <code>{'{{full_name}}'}</code> and{' '}
              <code>{'{{email}}'}</code> work in the subject, preview text and body, filled in
              for each attendee. Test sends use your own name.
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

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              {isEdit ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-rose-400 transition hover:bg-rose-500/10 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" /> Delete draft
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || !canSave}
                className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface/40 px-5 py-2.5 text-sm font-semibold text-ink-primary transition hover:bg-white/5 disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> Save draft
              </button>
              <button
                type="button"
                onClick={handleSendNow}
                disabled={busy || !canSave || !eventId}
                className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-95 disabled:opacity-50"
              >
                {busy ? (
                  'Working...'
                ) : (
                  <>
                    Send now <Send className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
