'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Lock, Mail, Sparkles } from 'lucide-react';
import { ApiError, authApi, persistTokens } from '@/lib/auth';
import { useToast } from '@/components/toast';

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const tokens = await authApi.login({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      });
      persistTokens(tokens);
      const next =
        new URLSearchParams(window.location.search).get('next') ?? '/dashboard';
      toast.success('Welcome back', 'Loading your workspace.');
      router.push(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Email or password is incorrect.');
      } else {
        setError('Could not sign you in. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!email) {
      setError('Enter your email first to receive a code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await authApi.sendOtp({
        channel: 'email',
        destination: email.trim().toLowerCase(),
        purpose: 'login',
      });
      const next = new URLSearchParams(window.location.search).get('next') ?? '/dashboard';
      router.push(
        `/otp?destination=${encodeURIComponent(email.trim().toLowerCase())}&purpose=login&next=${encodeURIComponent(next)}`,
      );
    } catch {
      setError('Could not send a sign-in code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Sign in"
      title="Welcome back."
      subtitle="Pick up where you left off."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Email"
          name="email"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          icon={<Mail className="h-4 w-4" />}
          value={email}
          onChange={(v) => setEmail(v)}
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          placeholder="Your password"
          autoComplete="current-password"
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
          {loading ? 'Signing in...' : (
            <>
              Sign in <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleMagicLink}
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-surface-border bg-surface/40 py-3 text-sm font-semibold text-ink-primary transition hover:bg-white/5 disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5 text-brand-300" />
          Email me a sign-in code
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-ink-secondary">
        New here?{' '}
        <Link href="/signup" className="font-semibold text-brand-300 hover:text-brand-200">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-surface-deep text-ink-primary">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[480px] w-[920px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-[#0EA5A5]/10 blur-3xl" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-brand-gradient" />
          <span className="text-base font-semibold tracking-tight">Orkora</span>
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
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">{title}</h1>
          <p className="mt-3 text-sm text-ink-secondary">{subtitle}</p>
          <div className="mt-10 rounded-3xl border border-surface-border bg-surface/40 p-6 sm:p-8">
            {children}
          </div>
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
  value,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  icon?: React.ReactNode;
  value?: string;
  onChange?: (v: string) => void;
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
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className={`w-full rounded-xl border border-surface-border bg-surface-deep/60 ${icon ? 'pl-11' : 'pl-4'} py-3 pr-4 text-sm text-ink-primary placeholder-ink-muted outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30`}
        />
      </div>
    </label>
  );
}
