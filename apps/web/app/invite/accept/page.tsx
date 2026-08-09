'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/auth';

type State =
  | { kind: 'working' }
  | { kind: 'success'; role: string }
  | { kind: 'mismatch' }
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string };

function AcceptInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');
  const [state, setState] = useState<State>({ kind: 'working' });

  useEffect(() => {
    if (!token) {
      setState({ kind: 'invalid' });
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch<{ organizationId: string; role: string }>(
          '/v1/invitations/accept',
          { method: 'POST', json: { token } },
        );
        if (!cancelled) setState({ kind: 'success', role: res?.role ?? 'member' });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          const detail = (err.message || '').toLowerCase();
          if (detail.includes('different email')) {
            setState({ kind: 'mismatch' });
            return;
          }
          if (detail.includes('invalid or expired')) {
            setState({ kind: 'expired' });
            return;
          }
          if (err.status === 401) {
            // Not signed in. Send them to log in, then bounce straight back here
            // to finish accepting with the same token.
            const next = encodeURIComponent(`/invite/accept?token=${encodeURIComponent(token)}`);
            router.replace(`/login?next=${next}`);
            return;
          }
          setState({ kind: 'error', message: err.message || 'Something went wrong.' });
          return;
        }
        setState({ kind: 'error', message: 'Something went wrong.' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-deep px-6 text-ink-primary">
      <div className="w-full max-w-md rounded-2xl border border-surface-border bg-surface/40 p-8 text-center shadow-xl">
        {state.kind === 'working' && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-400" />
            <h1 className="mt-4 text-lg font-semibold">Accepting your invitation…</h1>
            <p className="mt-1 text-sm text-ink-secondary">One moment.</p>
          </>
        )}

        {state.kind === 'success' && (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <h1 className="mt-4 text-lg font-semibold">You&apos;re in.</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              You joined the organisation as <span className="font-medium text-ink-primary">{state.role}</span>.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-brand-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              Go to dashboard
            </Link>
          </>
        )}

        {state.kind === 'mismatch' && (
          <>
            <AlertCircle className="mx-auto h-8 w-8 text-amber-400" />
            <h1 className="mt-4 text-lg font-semibold">This invite is for a different email</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              You are signed in with an account that does not match the invited address. Sign in with the
              email the invitation was sent to, then open the link again.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center justify-center rounded-full border border-surface-border px-5 py-2 text-sm font-medium text-ink-primary transition hover:bg-surface/60"
            >
              Switch account
            </Link>
          </>
        )}

        {state.kind === 'expired' && (
          <>
            <AlertCircle className="mx-auto h-8 w-8 text-amber-400" />
            <h1 className="mt-4 text-lg font-semibold">This invitation is no longer valid</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              It may have expired, been revoked, or already been accepted. Ask the organiser to send a new
              invite.
            </p>
          </>
        )}

        {state.kind === 'invalid' && (
          <>
            <AlertCircle className="mx-auto h-8 w-8 text-amber-400" />
            <h1 className="mt-4 text-lg font-semibold">Invalid invitation link</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              This link is missing its token. Please use the exact link from your invitation email.
            </p>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
            <h1 className="mt-4 text-lg font-semibold">Could not accept the invitation</h1>
            <p className="mt-1 text-sm text-ink-secondary">{state.message}</p>
          </>
        )}
      </div>
    </main>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-surface-deep text-ink-primary">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </main>
      }
    >
      <AcceptInner />
    </Suspense>
  );
}
