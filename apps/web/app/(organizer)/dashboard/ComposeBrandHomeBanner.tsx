'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, X } from 'lucide-react';

const KEY = 'orkora_dismiss_brandhome_banner';

/**
 * Adoption nudge (D1): prompts organisers into the Brand Home composer. Shows on
 * the dashboard until dismissed; the dismissal is remembered in localStorage so
 * it never nags after the organiser has engaged or opted out.
 */
export default function ComposeBrandHomeBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== '1');
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // ignore
    }
    setShow(false);
  }

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-brand-500/30 bg-brand-500/10 p-5">
      <div className="flex items-start gap-3 pr-8">
        <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-500/20">
          <Sparkles className="h-4 w-4 text-brand-300" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-ink-primary">Turn your page into a brand home</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
            Your events now live inside a year-round public home. Compose the hero, tell your story, and start
            capturing a community that comes back for every drop.
          </p>
          <Link
            href="/dashboard/branding"
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
          >
            <Sparkles className="h-4 w-4" /> Compose your Brand Home
          </Link>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 rounded-md p-1.5 text-ink-muted transition hover:bg-white/10 hover:text-ink-primary"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
