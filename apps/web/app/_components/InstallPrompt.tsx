'use client';

/**
 * Install prompt for the Orkora PWA.
 *
 * Detects three install paths:
 *
 *   1. Android Chrome / Edge: the browser fires `beforeinstallprompt` once
 *      it has decided the page is installable. We capture the event, render
 *      our own "Install" button, and call `prompt()` when the user clicks it.
 *   2. iOS Safari: there is no programmatic install. We detect iOS + Safari
 *      and render plain-language instructions ("Tap Share, then Add to Home
 *      Screen"). The user-agent check is conservative; misdetects render
 *      the Android-style button which is harmless.
 *   3. Desktop Chrome / Edge / Brave: same as (1). On macOS Safari there is
 *      no PWA install path; we hide the prompt entirely.
 *
 * The component is silent (renders nothing) in three cases: the user already
 * installed the PWA, the user dismissed the prompt within the last 7 days,
 * or the browser does not support installs at all.
 *
 * Usage:
 *
 *   <InstallPrompt variant="banner" />   // sticky bottom banner on phones
 *   <InstallPrompt variant="inline" />   // inline card, e.g. on the event page
 *
 * Both variants share the same logic; only the wrapper changes.
 */

import { useEffect, useState } from 'react';
import { Smartphone, Share, Plus, X, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Variant = 'banner' | 'inline';

const DISMISS_KEY = 'orkora_install_dismissed_at';
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // Chrome / Android: display-mode media query.
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari: non-standard navigator.standalone, only set when launched
  // from the home-screen icon.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return false;
}

function detectIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
  // Safari only - Chrome on iOS reports CriOS in the UA and uses WebKit but
  // cannot install PWAs. We still show iOS instructions; the user can copy
  // the URL into Safari.
  return isIos;
}

function dismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const ts = Number(window.localStorage.getItem(DISMISS_KEY));
    if (!ts) return false;
    return Date.now() - ts < DISMISS_WINDOW_MS;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore storage failures */
  }
}

export default function InstallPrompt({ variant = 'banner' }: { variant?: Variant }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone()) return; // already installed
    if (dismissed()) return;

    // Android / desktop Chrome path: wait for beforeinstallprompt.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS path: no programmatic prompt. Show the hint card if we are on iOS
    // Safari and the page has been open for at least 2 seconds (avoid an
    // instant nag on first load).
    if (detectIos()) {
      const t = setTimeout(() => {
        setShowIosHint(true);
        setHidden(false);
      }, 2000);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  async function handleInstall() {
    if (!deferred) return;
    await deferred.prompt();
    const result = await deferred.userChoice;
    if (result.outcome === 'dismissed') markDismissed();
    setDeferred(null);
    setHidden(true);
  }

  function handleDismiss() {
    markDismissed();
    setHidden(true);
  }

  if (hidden) return null;

  // ---- Render ----

  const wrapperClass =
    variant === 'banner'
      ? 'fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md p-3 sm:max-w-lg'
      : 'w-full';

  // Android / desktop installable path.
  if (deferred) {
    return (
      <div className={wrapperClass}>
        <div className="relative flex items-center gap-3 rounded-2xl border border-brand-500/40 bg-surface/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-gradient">
            <Smartphone className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-ink-primary">Install Orkora</p>
            <p className="text-xs text-ink-secondary">
              Get the app on your home screen. No App Store needed.
            </p>
          </div>
          <button
            type="button"
            onClick={handleInstall}
            className="inline-flex items-center gap-1 rounded-full bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white shadow-glow transition hover:opacity-95"
          >
            <Download className="h-3.5 w-3.5" /> Install
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition hover:bg-white/5 hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // iOS Safari instructions path.
  if (showIosHint) {
    return (
      <div className={wrapperClass}>
        <div className="relative rounded-2xl border border-brand-500/40 bg-surface/95 p-4 shadow-2xl backdrop-blur">
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition hover:bg-white/5 hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-gradient">
              <Smartphone className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-ink-primary">Install Orkora</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                Tap{' '}
                <Share className="inline-block h-3.5 w-3.5 align-text-bottom text-brand-300" />{' '}
                Share at the bottom of Safari, then choose{' '}
                <Plus className="inline-block h-3.5 w-3.5 align-text-bottom text-brand-300" />{' '}
                <strong className="text-ink-primary">Add to Home Screen</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
