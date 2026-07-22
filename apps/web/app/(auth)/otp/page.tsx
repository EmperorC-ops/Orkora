'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, apiFetch, authApi, persistTokens, safeInternalPath } from '@/lib/auth';
import type { TokenBundle } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/admin';
import { Brand } from '@/components/brand';

const RESEND_SECONDS = 30;

function OtpPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const destination = params.get('destination') ?? '';
  const purpose = (params.get('purpose') ?? 'login') as 'signup' | 'login';
  const next = safeInternalPath(params.get('next'));

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputs.current[0]?.focus();
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  function setDigit(i: number, raw: string) {
    setError(null);
    if (raw.length > 1) {
      const cleaned = raw.replace(/\D/g, '').slice(0, 6).split('');
      const next = ['', '', '', '', '', ''];
      for (let k = 0; k < cleaned.length; k++) next[k] = cleaned[k] ?? '';
      setDigits(next);
      const lastIdx = Math.min(cleaned.length, 5);
      inputs.current[lastIdx]?.focus();
      if (cleaned.length === 6) verify(next.join(''));
      return;
    }
    const value = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = value;
    setDigits(next);
    if (value && i < 5) inputs.current[i + 1]?.focus();
    if (next.every((d) => d.length === 1)) verify(next.join(''));
  }

  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  }

  async function verify(code: string) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      // Both signup and login converge on /v1/auth/otp/exchange: it verifies
      // the code, marks the email verified, issues the token bundle, and sets
      // the refresh + CSRF cookies in one round trip. The user record already
      // exists (created by POST /v1/auth/signup on the /signup page for the
      // signup flow, or from a prior registration for the login flow), so no
      // password needs to travel here — which is why the old sessionStorage
      // password stash is gone. The previous signup branch called
      // verifyOtp + /auth/signup, the latter of which returns no tokens, so
      // the session was never established and every later request 401'd.
      const tokens = await apiFetch<TokenBundle>('/v1/auth/otp/exchange', {
        method: 'POST',
        json: { destination, code, purpose },
        auth: false,
      });
      persistTokens(tokens);
      // Clean up any stale stash left by older builds of the signup page.
      try {
        sessionStorage.removeItem('orkora_pending_signup');
      } catch {
        // ignore
      }
      router.push((isSuperAdmin() ? '/admin' : next) as Route);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('That code is incorrect or expired.');
      } else if (err instanceof ApiError && err.status === 409) {
        setError('That email is already registered. Sign in instead.');
      } else {
        setError('Could not verify your code. Try again.');
      }
      setDigits(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (resendIn > 0 || loading) return;
    setLoading(true);
    setError(null);
    try {
      await authApi.sendOtp({
        channel: 'email',
        destination,
        purpose: purpose === 'signup' ? 'signup' : 'login',
      });
      setResendIn(RESEND_SECONDS);
    } catch {
      setError('Could not resend code. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  if (!destination) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-brand-gradient px-6">
        <Brand variant="lockup" width={320} priority className="h-20 w-auto" />
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <h1 className="text-xl font-bold text-slate-900">Missing context</h1>
          <p className="mt-2 text-sm text-slate-500">
            Open this page from the sign in or sign up flow.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-brand-gradient px-6">
      <Brand variant="lockup" width={320} priority className="h-20 w-auto" />
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">Check your email</h1>
        <p className="mb-6 text-sm text-slate-500">
          We sent a 6-digit code to <span className="font-semibold text-slate-700">{destination}</span>.
        </p>

        <div className="flex justify-between gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => handleKey(i, e)}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={i === 0 ? 6 : 1}
              disabled={loading}
              className={`h-14 w-12 rounded-lg border bg-slate-50 text-center text-xl font-bold text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 ${
                d ? 'border-brand-500 bg-brand-50' : 'border-slate-200'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-center text-sm text-red-700">
            {error}
          </p>
        )}

        {loading && (
          <p className="mt-4 text-center text-sm text-slate-500">Verifying...</p>
        )}

        <button
          type="button"
          onClick={resend}
          disabled={resendIn > 0 || loading}
          className="mt-6 block w-full text-center text-sm font-semibold text-brand-700 hover:underline disabled:text-slate-400"
        >
          {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
        </button>
      </div>
    </div>
  );
}


export default function OtpPage() {
  // useSearchParams() requires a Suspense boundary during static export
  // (Next.js 14). Anything outside the boundary can be prerendered; the
  // inner component renders client-side once params resolve.
  return (
    <Suspense fallback={null}>
      <OtpPageInner />
    </Suspense>
  );
}
