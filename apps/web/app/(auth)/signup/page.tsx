'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Lock, Mail, Phone, User } from 'lucide-react';
import { ApiError, authApi } from '@/lib/auth';
import { Brand } from '@/components/brand';

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const fullName = String(form.get('fullName') ?? '').trim();
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    const phone = String(form.get('phone') ?? '').trim();
    const password = String(form.get('password') ?? '');

    if (fullName.length < 2) return setError('Please enter your full name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return setError('Enter a valid email address.');
    }
    if (password.length < 8) return setError('Password must be at least 8 characters.');

    setLoading(true);
    setError(null);
    try {
      await authApi.sendOtp({ channel: 'email', destination: email, purpose: 'signup' });
      // Credentials must NOT travel in the URL: query strings are written to
      // browser history, edge / CDN logs, Vercel access logs, and outgoing
      // Referer headers on any link click. Stash them in sessionStorage (same
      // origin, same tab, cleared on tab close) and let the OTP page consume +
      // wipe them. Only non-sensitive routing values stay in the URL.
      try {
        sessionStorage.setItem(
          'orkora_pending_signup',
          JSON.stringify({ fullName, phone, password }),
        );
      } catch {
        // Storage unavailable (Safari private mode, embedded contexts): fall
        // back to in-URL credentials so the flow does not silently break. The
        // OTP page reads either source.
      }
      const params = new URLSearchParams({ destination: email, purpose: 'signup' });
      router.push(`/otp?${params.toString()}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Please wait a moment before trying again.');
      } else if (err instanceof ApiError && err.status === 409) {
        setError('That email is already registered. Try signing in instead.');
      } else {
        setError('Could not send verification code. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-surface-deep text-ink-primary">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[480px] w-[920px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-[420px] w-[420px] rounded-full bg-[#FF7675]/10 blur-3xl" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center" aria-label="Orkora home">
          <Brand variant="lockup" width={560} priority className="h-36 w-auto" />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-100px)] max-w-md items-start justify-center px-6 pb-16 pt-8 sm:pt-16">
        <div className="w-full">
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Get started</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
            Create your workspace.
          </h1>
          <p className="mt-3 text-sm text-ink-secondary">
            Run your first event in under five minutes. No card required.
          </p>
          <div className="mt-10 rounded-3xl border border-surface-border bg-surface/40 p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field
                label="Full name"
                name="fullName"
                placeholder="Ada Lovelace"
                autoComplete="name"
                icon={<User className="h-4 w-4" />}
                required
              />
              <Field
                label="Work email"
                name="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                icon={<Mail className="h-4 w-4" />}
                required
              />
              <Field
                label="Phone (optional)"
                name="phone"
                placeholder="+234 800 000 0000"
                autoComplete="tel"
                icon={<Phone className="h-4 w-4" />}
              />
              <Field
                label="Password"
                name="password"
                type="password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                icon={<Lock className="h-4 w-4" />}
                required
              />

              {error ? (
                <p className="rounded-xl border border-[#FF7675]/30 bg-[#FF7675]/10 px-3 py-2 text-sm text-[#FF9090]">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-gradient py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95 disabled:opacity-60"
              >
                {loading ? 'Sending code...' : (
                  <>
                    Continue <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="mt-8 text-center text-sm text-ink-secondary">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-brand-300 hover:text-brand-200">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  name,
  type = 'text',
  placeholder,
  autoComplete,
  required,
  icon,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted">
            {icon}
          </span>
        ) : null}
        <input
          name={name}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={`w-full rounded-xl border border-surface-border bg-surface-deep/60 ${icon ? 'pl-11' : 'pl-4