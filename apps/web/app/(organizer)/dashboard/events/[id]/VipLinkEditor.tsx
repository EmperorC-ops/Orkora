'use client';

import { useState } from 'react';
import { Copy, Loader2, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { eventsApi } from '@/lib/events';

/**
 * VIP express link control. One shared secret link per event. When generated,
 * anyone holding the link registers with name + email only and skips the event's
 * custom questions; their registration is tagged VIP in the registrations list.
 *
 * Generate is idempotent; Regenerate mints a fresh token and retires the old
 * link. Remove clears the link entirely.
 */
export default function VipLinkEditor({
  orgId,
  eventId,
  code,
  initialToken,
  disabled,
  onError,
  onNotice,
}: {
  orgId: string;
  eventId: string;
  code: string;
  initialToken: string | null;
  disabled?: boolean;
  onError: (msg: string) => void;
  onNotice: (msg: string) => void;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const url =
    token && typeof window !== 'undefined'
      ? `${window.location.origin}/e/${code}/vip?t=${encodeURIComponent(token)}`
      : null;

  async function generate(regenerate: boolean) {
    setBusy(true);
    try {
      const res = await eventsApi(orgId).generateVipLink(eventId, regenerate);
      setToken(res.token);
      onNotice(regenerate ? 'New VIP link generated' : 'VIP link ready');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not generate the VIP link.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm('Remove the VIP link? Anyone still holding it will no longer be able to use it.'))
      return;
    setBusy(true);
    try {
      await eventsApi(orgId).revokeVipLink(eventId);
      setToken(null);
      onNotice('VIP link removed');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not remove the VIP link.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-700" />
        <h3 className="font-semibold text-slate-900">VIP express link</h3>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        A private, shareable link for VIP guests. They register with just their name and email, skip
        the questions on your form, and get their ticket instantly. Registrations made through it are
        tagged VIP in your list.
      </p>

      {token && url ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-[240px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
            />
            <button
              type="button"
              onClick={copy}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
            >
              <Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          {!disabled && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => generate(true)}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Regenerate
              </button>
              <button
                type="button"
                onClick={revoke}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" /> Remove link
              </button>
            </div>
          )}
          <p className="text-xs text-slate-400">
            VIP guests are given a free ticket, so this event needs at least one free ticket tier for
            the link to work.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => generate(false)}
            disabled={disabled || busy}
            className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate VIP link
          </button>
        </div>
      )}
    </section>
  );
}
