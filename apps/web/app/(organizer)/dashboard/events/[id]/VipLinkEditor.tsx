'use client';

import { useState } from 'react';
import { Copy, Loader2, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { eventsApi } from '@/lib/events';

/**
 * VIP express link control. One shared secret link per event, in a compact
 * path form: `/e/<code>/vip/<token>`. When the organizer types a custom word,
 * the token becomes that word plus a short random suffix (e.g.
 * `goldclass-7kd9qs`), so the link is branded but still hard to guess.
 *
 * Anyone holding the link registers with name + email only and skips the
 * event's custom questions; their registration is tagged VIP in the list.
 * Regenerate mints a fresh token (applying the current word) and retires the
 * old link. Remove clears the link entirely.
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
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const url =
    token && typeof window !== 'undefined'
      ? `${window.location.origin}/e/${code}/vip/${encodeURIComponent(token)}`
      : null;

  async function generate(regenerate: boolean) {
    setBusy(true);
    try {
      const label = word.trim() || undefined;
      const res = await eventsApi(orgId).generateVipLink(eventId, regenerate, label);
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

  const wordField = !disabled && (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        Custom word (optional)
      </label>
      <input
        value={word}
        onChange={(e) => setWord(e.target.value)}
        placeholder="e.g. goldclass"
        maxLength={40}
        className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400"
      />
      <p className="mt-1 text-xs text-slate-400">
        We add a short random code so the link stays hard to guess. Leave blank for a plain random
        link.
      </p>
    </div>
  );

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
          {wordField}
          {!disabled && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => generate(true)}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {word.trim() ? 'Apply word / regenerate' : 'Regenerate'}
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
        <div className="mt-4 space-y-3">
          {wordField}
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
