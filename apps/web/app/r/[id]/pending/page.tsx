import Link from 'next/link';
import { ArrowLeft, Hourglass } from 'lucide-react';

export default function PendingPaymentPage() {
  return (
    <main className="relative min-h-screen bg-surface-deep text-ink-primary">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[420px] w-[920px] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="relative mx-auto max-w-2xl px-6 py-20 text-center">
        <Link
          href="/"
          className="mb-12 inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <div className="rounded-3xl border border-surface-border bg-surface/40 p-12">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
            <Hourglass className="h-6 w-6" />
          </span>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">Payment is on the way.</h1>
          <p className="mt-4 text-base text-ink-secondary">
            Your seats are reserved. Hosted checkout for Stripe, Paystack, and Flutterwave is being
            wired in a later release. Until then, the organizer can confirm your registration
            manually.
          </p>
          <p className="mt-6 text-xs text-ink-muted">
            You will receive a confirmation email once payment is captured.
          </p>
        </div>
      </div>
    </main>
  );
}
