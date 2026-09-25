'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Calendar, Sparkles } from 'lucide-react';
import { ApiError } from '@/lib/auth';
import { registrationApi, formatEventDates, type VipContext } from '@/lib/registration';

/**
 * VIP express registration. A guest who has the event's shared VIP link lands
 * here, gives name + email only, and is issued a ticket immediately. The event's
 * custom questions are skipped by design. The link carries the shared token as
 * `?t=`; a missing or wrong token shows a "link not valid" state.
 */
export default function VipRegisterPage() {
  return (
    <Suspense
      fallback={
        <Wrapper>
          <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center text-sm text-ink-secondary">
            Checking your invitation...
          </div>
        </Wrapper>
      }
    >
      <VipRegisterInner />
    </Suspense>
  );
}

function VipRegisterInner() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const code = params?.code ?? '';
  const token = search?.get('t') ?? '';

  const [ctx, setCtx] = useState<VipContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!code || !token) {
      setLoadError('This VIP link is missing its access code.');
      return;
    }
    registrationApi
      .vipContext(code, token)
      .then((c) => {
        if (!cancelled) setCtx(c);
      })
      .catch(() => {
        if (!cancelled) setLoadError('This VIP link is not valid or has expired.');
      });
    return () => {
      cancelled = true;
    };
  }, [code, token]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setSubmitError('Please enter your name and email.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await registrationApi.registerVip(code, {
        token,
        fullName: fullName.trim(),
        email: email.trim(),
      });
      const ticketCode = result.tickets[0]?.code;
      if (ticketCode) {
        router.push(`/t/${ticketCode}`);
        return;
      }
      setSubmitError('Registered, but no ticket was returned. Please contact the organizer.');
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(prettifyApiError(err));
      } else {
        setSubmitError('Could not complete your registration. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <Wrapper>
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">VIP link not valid</h1>
          <p className="mt-3 text-sm text-ink-secondary">{loadError}</p>
          <Link
            href={`/e/${code}`}
            className="mt-6 inline-flex items-center gap-2 text-sm text-brand-300 hover:text-brand-200"
          >
            <ArrowLeft className="h-4 w-4" /> Go to the event page
          </Link>
        </div>
      </Wrapper>
    );
  }

  if (!ctx) {
    return (
      <Wrapper>
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center text-sm text-ink-secondary">
          Checking your invitation...
        </div>
      </Wrapper>
    );
  }

  const brand = ctx.organization.brandColor || '#6C5CE7';

  return (
    <Wrapper>
      <div className="mx-auto max-w-xl">
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-white"
          style={{ backgroundColor: brand }}
        >
          <Sparkles className="h-3.5 w-3.5" /> VIP invitation
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{ctx.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-secondary">
          <span className="inline-flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {formatEventDates(ctx.startAt, ctx.endAt, ctx.timezone)}
          </span>
          <span>Hosted by {ctx.organization.name}</span>
        </div>

        <p className="mt-6 text-sm text-ink-secondary">
          You have been invited as a VIP guest. Just confirm your details below and your ticket is
          on its way. No forms, no queue.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-5 rounded-2xl border border-surface-border bg-surface/40 p-6"
        >
          <Field label="Full name" value={fullName} onChange={setFullName} required />
          <Field label="Email" type="email" value={email} onChange={setEmail} required />

          {submitError && (
            <p className="rounded-xl border border-[#FF7675]/30 bg-[#FF7675]/10 px-4 py-3 text-sm text-[#FF9090]">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95 disabled:opacity-50"
            style={{ backgroundColor: brand }}
          >
            {submitting ? 'Confirming...' : 'Confirm my VIP ticket'}
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="text-center text-xs text-ink-muted">
            Your ticket and receipt are emailed instantly.
          </p>
        </form>
      </div>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-surface-deep text-ink-primary">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[420px] w-[920px] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-6 py-12">{children}</div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-xl border border-surface-border bg-surface-deep/60 px-4 py-3 text-sm text-ink-primary placeholder-ink-muted outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
      />
    </label>
  );
}

function prettifyApiError(err: ApiError): string {
  try {
    const parsed = JSON.parse(err.message) as { detail?: string };
    if (parsed.detail) return parsed.detail;
  } catch {
    // Not JSON, fall through.
  }
  if (err.status === 409) return 'This event is fully booked.';
  if (err.status === 404) return 'This VIP link is not valid or has expired.';
  if (err.status === 400) return 'Please check your details and try again.';
  return err.message || 'Something went wrong.';
}
