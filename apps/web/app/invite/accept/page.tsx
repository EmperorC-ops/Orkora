'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiFetch, ApiError, authApi, clearTokens, refreshSession } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';

/** Email of the account this tab is signed in as, read from the access token. */
function readSignedInEmail(): string | null {
  try {
    const token = sessionStorage.getItem('access_token');
    const body = token?.split('.')[1];
    if (!body) return null;
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as {
      email?: string;
    };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

type State =
  | { kind: 'working' }
  | { kind: 'success'; role: string }
  | { kind: 'mismatch' }
  | { kind: 'already' }
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string };

function AcceptInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');
  const [state, setState] = useState<State>({ kind: 'working' });
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  // The usual cause of a mismatch is opening the invite in a browser that is
  // already signed in to another Orkora account (often the organizer's own).
  // The old "Switch account" link went to /login without signing out and
  // without the token, so the person never got back to the invitation. This
  // signs out properly, then returns here via `next` once they sign in.
  async function switchAccount() {
    if (!token) return;
    setSwitching(true);
    try {
      await authApi.logout();
    } catch {
      // Signing out server-side is best effort; local tokens are cleared below.
    }
    clearTokens();
    const next = encodeURIComponent(`/invite/accept?token=${encodeURIComponent(token)}`);
    router.replace(`/login?next=${next}`);
  }

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
        // The access token in this tab was issued before the membership
        // existed, so it does not list the new organization. Without a fresh
        // token the dashboard sees "no organization" and shows the create-an-
        // organization screen. Refreshing re-reads memberships from the
        // database, then we take the person straight to the dashboard.
        await refreshSession().catch(() => false);
        if (cancelled) return;
        setState({ kind: 'success', role: res?.role ?? 'member' });
        setTimeout(() => {
          if (!cancelled) router.replace('/dashboard');
        }, 1200);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          const detail = (err.message || '').toLowerCase();
          if (detail.includes('different email')) {
            setSignedInAs(readSignedInEmail());
            setState({ kind: 'mismatch' });
            return;
          }
          if (detail.includes('invalid or expired')) {
            // Invites are single-use. The common case here is a team member
            // who already accepted and is reusing the email link to sign in
            // again. If they are signed in and already belong to an
            // organization, just take them to the dashboard.
            await refreshSession().catch(() => false);
            if (cancelled) return;
            if (readActiveOrgId()) {
              setState({ kind: 'already' });
              setTimeout(() => {
                if (!cancelled) router.replace('/dashboard');
              }, 1200);
              return;
            }
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
        // Not an ApiError: the request never got a response. Almost always a
        // network or cross-origin (CORS) failure, which happens when this page
        // is opened on the wrong host. Point the reader at the right place.
        setState({
          kind: 'error',
          message:
            'Could not reach the server. Please open this invite link from your Orkora site (orkora.events).',
        });
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

        {state.kind === 'already' && (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <h1 className="mt-4 text-lg font-semibold">You&apos;re already on the team.</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              This invitation was used when you joined. Taking you to your dashboard. Next time, sign
              in at orkora.events instead of using the invitation email.
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
            {signedInAs ? (
              <p className="mt-3 text-sm text-ink-secondary">
                Signed in as <span className="font-medium text-ink-primary">{signedInAs}</span>.
              </p>
            ) : null}
            <button
              type="button"
              onClick={switchAccount}
              disabled={switching}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-brand-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
            >
              {switching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign out and use the invited email
            </button>
            <p className="mt-3 text-xs text-ink-muted">
              You will come straight back here after signing in, and the invitation will be accepted.
            </p>
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
