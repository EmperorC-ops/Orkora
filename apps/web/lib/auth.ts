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
      // The refresh token lives in an httpOnly cookie now; we just POST
      // with `credentials: 'include'` and the browser sends it for us.
      const res = await fetch(`${API}/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: '{}',
      });
      if (!res.ok) return false;
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

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
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
