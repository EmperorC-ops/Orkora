/**
 * Lightweight client-side auth helpers for the web app.
 *
 * Storage model:
 *   - Access token: `sessionStorage` (short-lived, fine for an XSS surface).
 *   - Refresh token: httpOnly cookie set by the API on /auth/login,
 *     /auth/signup, /auth/social, /auth/otp/exchange, /auth/refresh. Not
 *     reachable from JS, so XSS cannot steal it.
 *
 * `apiFetch` sends `credentials: 'include'` on auth-related routes so the
 * cookie travels back to the API. On 401 it calls /auth/refresh once,
 * relies on the cookie to identify the user, then retries the original
 * request.
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface FetchInit extends RequestInit {
  json?: unknown;
  auth?: boolean;
  /** Internal: skip the 401 retry (used to break recursion). */
  _retried?: boolean;
}

export async function apiFetch<T>(path: string, init?: FetchInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.json !== undefined) headers.set('Content-Type', 'application/json');

  if (init?.auth !== false && typeof window !== 'undefined') {
    const t = sessionStorage.getItem('access_token');
    if (t) headers.set('Authorization', `Bearer ${t}`);
  }

  // Auth-flow routes need to carry / receive the refresh cookie. Other
  // routes are stateless and explicitly do not need credentials, which
  // also keeps CSRF surface tight.
  const isAuthRoute = path.startsWith('/v1/auth');

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    credentials: isAuthRoute ? 'include' : (init?.credentials ?? 'omit'),
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });

  // Single attempt to silently refresh on 401 for authenticated requests.
  if (
    res.status === 401 &&
    init?.auth !== false &&
    !init?._retried &&
    typeof window !== 'undefined'
  ) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiFetch<T>(path, { ...init, _retried: true });
    }
    // Refresh failed: clear and let the caller redirect.
    clearTokens();
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ApiError(res.status, detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Single-flight refresh: if multiple requests trigger refresh at the same
 * time, all of them await the same in-flight call so we never end up with
 * two refresh round-trips racing each other.
 */
let inflightRefresh: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    try {
      // The refresh token lives in an httpOnly cookie now; we POST with
      // `credentials: 'include'` and the browser sends it for us. The API
      // also requires an X-CSRF-Token header that matches the non-httpOnly
      // `orkora_csrf` companion cookie set on every login/refresh response.
      // A cross-site attacker cannot read that cookie (Same-Origin Policy
      // on document.cookie), so cannot forge the header. The double-submit
      // pattern blocks the cookie-only CSRF path even though the refresh
      // cookie is SameSite=None (required because web and API are on
      // different origins in production).
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      const csrf = readCsrfCookie();
      if (csrf) headers['X-CSRF-Token'] = csrf;

      const res = await fetch(`${API}/v1/auth/refresh`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: '{}',
      });
      if (!res.ok) {
        // A 401/403 here means the refresh cookie is missing, expired, or the
        // CSRF double-submit failed (the classic "stale session on a returning
        // browser" state). Self-heal: wipe local session so the app routes to
        // a clean re-login rather than dead-ending on a raw 401 forever. The
        // next fresh login re-issues domain-scoped cookies that work. Without
        // this, a customer who ever held a stale cookie was stuck until they
        // manually cleared site data or used incognito.
        if (res.status === 401 || res.status === 403) {
          clearTokens();
        }
        return false;
      }
      const tokens = (await res.json()) as TokenBundle;
      persistTokens(tokens);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        inflightRefresh = null;
      }, 0);
    }
  })();
  return inflightRefresh;
}

/**
 * Reads the `orkora_csrf` cookie via document.cookie. Returns null if the
 * cookie is not present (server-side render, fresh browser, or pre-login).
 * The cookie is set non-httpOnly precisely so we can read it here; the
 * value is then echoed in `X-CSRF-Token` to defeat cross-site CSRF on
 * /v1/auth/refresh.
 */
function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const pairs = document.cookie.split(';');
  for (const raw of pairs) {
    const [k, v] = raw.split('=').map((s) => s.trim());
    if (k === 'orkora_csrf' && v) return decodeURIComponent(v);
  }
  return null;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Sanitize a post-auth redirect target taken from the `next` query param.
 * Only same-origin relative paths are allowed; anything absolute
 * (https://evil.com), protocol-relative (//evil.com), or scheme-bearing
 * (javascript:) falls back to /dashboard. Prevents open-redirect phishing.
 */
export function safeInternalPath(raw: string | null | undefined): string {
  const fallback = '/dashboard';
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return fallback;
  }
  return raw;
}

export function persistTokens(t: TokenBundle): void {
  sessionStorage.setItem('access_token', t.accessToken);
  // The refresh token also arrives in the response body for backward
  // compatibility with older clients (mobile), but the web client trusts
  // only the httpOnly cookie set by the same response. We deliberately do
  // not stash it anywhere reachable from JS.
}

export function clearTokens(): void {
  sessionStorage.removeItem('access_token');
  // Remove a stale value that a previous build may have written.
  sessionStorage.removeItem('refresh_token');
}

export const authApi = {
  signup: (input: { email: string; password: string; fullName: string; phone?: string }) =>
    apiFetch<TokenBundle>('/v1/auth/signup', { method: 'POST', json: input, auth: false }),
  login: (input: { email: string; password: string }) =>
    apiFetch<TokenBundle>('/v1/auth/login', { method: 'POST', json: input, auth: false }),
  social: (input: { provider: 'google' | 'apple'; idToken: string }) =>
    apiFetch<TokenBundle>('/v1/auth/social', { method: 'POST', json: input, auth: false }),
  sendOtp: (input: {
    channel: 'email' | 'sms';
    destination: string;
    purpose: 'signup' | 'login' | 'payment_confirm' | 'phone_verify';
  }) =>
    apiFetch<{ expiresAt: string }>('/v1/auth/otp/send', {
      method: 'POST',
      json: input,
      auth: false,
    }),
  verifyOtp: (input: { destination: string; code: string; purpose: string }) =>
    apiFetch<{ verified: boolean }>('/v1/auth/otp/verify', {
      method: 'POST',
      json: input,
      auth: false,
    }),
  logout: () => apiFetch<void>('/v1/auth/logout', { method: 'POST' }),
};
