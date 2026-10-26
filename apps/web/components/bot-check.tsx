'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Bot checks for public forms that make Orkora send an email (signup, sign-in
 * code, registration, VIP registration). Two parts:
 *
 *   - Cloudflare Turnstile, rendered only when NEXT_PUBLIC_TURNSTILE_SITE_KEY
 *     is set. With no key nothing renders and no token is sent, so the site
 *     works the same before and after the keys exist.
 *   - A honeypot field people never see or fill. Its value is sent only when
 *     something filled it, so real requests carry no extra field.
 *
 * Usage:
 *   const bot = useBotCheck();
 *   ...{bot.fields}...                 inside the form
 *   api.call({ ...input, ...bot.payload() })
 *   bot.reset()                         after every attempt (tokens are single-use)
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loader) {
    loader = new Promise<TurnstileApi>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
      s.onerror = () => {
        loader = null;
        reject(new Error('turnstile failed to load'));
      };
      document.head.appendChild(s);
    });
  }
  return loader;
}

export const BOT_CHECK_ENABLED = Boolean(SITE_KEY);

export function useBotCheck() {
  const [token, setToken] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');
  const [loadError, setLoadError] = useState(false);
  const widgetId = useRef<string | null>(null);
  const boxEl = useRef<HTMLDivElement | null>(null);

  // Callback ref: render the widget whenever its box mounts (the box may
  // appear after the first render, for example on a later form step), and
  // remove it when the box goes away.
  const boxRef = useCallback((el: HTMLDivElement | null) => {
    if (boxEl.current && boxEl.current !== el && widgetId.current && window.turnstile) {
      window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    }
    boxEl.current = el;
    if (!el || !SITE_KEY) return;
    loadTurnstile()
      .then((ts) => {
        if (boxEl.current !== el || widgetId.current) return;
        widgetId.current = ts.render(el, {
          sitekey: SITE_KEY,
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
          theme: 'dark',
        });
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(
    () => () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    },
    [],
  );

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, []);

  /** Extra request fields: the token when there is one, the honeypot only when filled. */
  const payload = useCallback((): { captchaToken?: string; hpField?: string } => {
    const out: { captchaToken?: string; hpField?: string } = {};
    if (token) out.captchaToken = token;
    if (honeypot) out.hpField = honeypot;
    return out;
  }, [token, honeypot]);

  /** True when the form may be submitted: no Turnstile, or a solved one. */
  const ready = !SITE_KEY || Boolean(token);

  const fields = (
    <>
      {/* Honeypot: off-screen, unfocusable, hidden from assistive tech. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
        <label>
          Leave this field empty
          <input
            type="text"
            name="hpField"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>
      {SITE_KEY ? (
        <div>
          <div ref={boxRef} className="min-h-[65px]" />
          {loadError ? (
            <p className="mt-1 text-xs text-[#FF9090]">
              The security check could not load. Check your connection and refresh the page.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return { fields, payload, reset, ready, enabled: Boolean(SITE_KEY) };
}
