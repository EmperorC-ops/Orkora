'use client';

import { useEffect, useState } from 'react';
import { Loader2, ScrollText } from 'lucide-react';
import { LEGAL_LINKS, legalApi, type PendingAcceptance } from '@/lib/legal';

/**
 * Blocks the dashboard until the signed-in user has accepted the current
 * Terms of Service and Privacy Policy, and, for owners and admins, the current
 * Organizer Agreement for each organization they run.
 *
 * Fails open: if the status cannot be loaded (network error, or a web deploy
 * that lands before the API), the dashboard renders normally rather than
 * locking people out. The API still refuses to publish an event for an
 * organization that has not accepted the Organizer Agreement.
 */
export function LegalGate({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingAcceptance[] | null>(null);
  const [checked, setChecked] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    legalApi
      .status()
      .then((s) => {
        if (!cancelled) setPending(s.pending);
      })
      .catch(() => {
        if (!cancelled) setPending([]);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked) return null;
  if (!pending || pending.length === 0) return <>{children}</>;

  const personal = pending.filter((p) => p.document !== 'organizer');
  const orgs = pending.filter((p) => p.document === 'organizer');

  async function accept() {
    if (!agreed || !pending) return;
    setSaving(true);
    setError(null);
    try {
      const res = await legalApi.accept(
        pending.map((p) => ({
          document: p.document,
          version: p.version,
          organizationId: p.organizationId,
        })),
        'prompt',
      );
      setPending(res.pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="rounded-3xl border border-surface-border bg-surface/60 p-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient text-white">
            <ScrollText className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-ink-primary">
              Please Review Our Terms
            </h1>
            <p className="text-sm text-ink-secondary">Accept to continue to your dashboard.</p>
          </div>
        </div>

        <ul className="mt-6 space-y-2 text-sm">
          {personal.map((p) => (
            <li key={p.document} className="flex items-center justify-between gap-3">
              <a
                href={LEGAL_LINKS[p.document].href}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-brand-300 underline hover:text-brand-200"
              >
                {LEGAL_LINKS[p.document].label}
              </a>
              <span className="text-xs text-ink-muted">version {p.version}</span>
            </li>
          ))}
          {orgs.map((p) => (
            <li key={`org-${p.organizationId}`} className="flex items-center justify-between gap-3">
              <span>
                <a
                  href={LEGAL_LINKS.organizer.href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-brand-300 underline hover:text-brand-200"
                >
                  Organizer Agreement
                </a>{' '}
                <span className="text-ink-secondary">for {p.organizationName ?? 'your organization'}</span>
              </span>
              <span className="text-xs text-ink-muted">version {p.version}</span>
            </li>
          ))}
        </ul>

        {orgs.length > 0 ? (
          <p className="mt-4 rounded-xl border border-surface-border bg-surface-deep/40 px-3 py-2 text-xs text-ink-secondary">
            As an owner or admin you accept the Organizer Agreement on behalf of your organization.
            It covers the platform fee on paid tickets. Events created before the fee took effect
            keep their original terms until they end.
          </p>
        ) : null}

        <label className="mt-6 flex items-start gap-3 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-none rounded border-surface-border accent-brand-500"
          />
          <span>I have read and agree to the documents listed above.</span>
        </label>

        {error ? <p className="mt-3 text-sm text-[#FF9090]">{error}</p> : null}

        <button
          type="button"
          onClick={accept}
          disabled={!agreed || saving}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient px-6 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Accept and continue
        </button>
        <p className="mt-3 text-center text-xs text-ink-muted">
          Questions about the terms? Email legal@orkora.events.
        </p>
      </div>
    </div>
  );
}
