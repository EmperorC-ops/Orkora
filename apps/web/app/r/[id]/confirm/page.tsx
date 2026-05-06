'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Hourglass, XCircle } from 'lucide-react';
import { paymentsApi, type OrderStatusView } from '@/lib/registration';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 90_000;

export default function ConfirmOrderPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? '';
  const [order, setOrder] = useState<OrderStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    const start = Date.now();

    async function pollOnce() {
      try {
        const o = await paymentsApi.getOrder(orderId);
        if (cancelled) return;
        setOrder(o);
        if (o.status === 'paid' || o.status === 'failed' || o.status === 'refunded') {
          return; // terminal
        }
        if (Date.now() - start > POLL_TIMEOUT_MS) {
          setTimedOut(true);
          return;
        }
        setTimeout(pollOnce, POLL_INTERVAL_MS);
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? 'Could not load order.');
      }
    }
    pollOnce();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <main className="relative min-h-screen bg-surface-deep text-ink-primary">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[420px] w-[920px] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="relative mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/"
          className="mb-10 inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>

        {error ? (
          <Card>
            <Icon tone="warm">
              <XCircle className="h-6 w-6" />
            </Icon>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">Could not load order</h1>
            <p className="mt-3 text-sm text-ink-secondary">{error}</p>
          </Card>
        ) : !order ? (
          <Card>
            <Icon tone="brand">
              <Hourglass className="h-6 w-6" />
            </Icon>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">Confirming payment</h1>
            <p className="mt-3 text-sm text-ink-secondary">Talking to your bank...</p>
          </Card>
        ) : order.status === 'paid' ? (
          <PaidView order={order} />
        ) : order.status === 'failed' ? (
          <Card>
            <Icon tone="warm">
              <XCircle className="h-6 w-6" />
            </Icon>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">Payment did not go through</h1>
            <p className="mt-3 text-sm text-ink-secondary">
              Your seats have been released. You can try again from the event page.
            </p>
            {order.event ? (
              <Link
                href={`/e/${order.event.code}/register`}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-7 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
              >
                Try again <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </Card>
        ) : timedOut ? (
          <Card>
            <Icon tone="brand">
              <Hourglass className="h-6 w-6" />
            </Icon>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">Still confirming</h1>
            <p className="mt-3 text-sm text-ink-secondary">
              Payment confirmation is taking a little longer than usual. We will email you the moment
              your tickets are ready. You can also refresh this page.
            </p>
          </Card>
        ) : (
          <Card>
            <Icon tone="brand">
              <Hourglass className="h-6 w-6" />
            </Icon>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">Confirming payment</h1>
            <p className="mt-3 text-sm text-ink-secondary">
              Status: <span className="font-mono">{order.status}</span>
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}

function PaidView({ order }: { order: OrderStatusView }) {
  const issued = order.tickets.filter((t) => t.status === 'issued');
  return (
    <Card align="left">
      <div className="text-center">
        <Icon tone="success">
          <CheckCircle2 className="h-6 w-6" />
        </Icon>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
          You are registered.
        </h1>
        {order.event ? (
          <p className="mt-2 text-sm text-ink-secondary">{order.event.title}</p>
        ) : null}
      </div>

      {issued.length > 0 ? (
        <div className="mt-10 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Your tickets
          </p>
          {issued.map((t) => (
            <Link
              key={t.id}
              href={`/t/${t.code}`}
              className="flex items-center justify-between rounded-2xl border border-surface-border bg-surface/40 px-5 py-4 transition hover:border-brand-500/40"
            >
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-brand-300">
                  {t.tier.name}
                </div>
                <div className="mt-1 text-base font-semibold text-ink-primary">{t.holderName}</div>
                <div className="mt-1 font-mono text-xs text-ink-muted">{t.code}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-ink-secondary" />
            </Link>
          ))}
        </div>
      ) : null}

      <p className="mt-10 text-center text-xs text-ink-muted">
        Confirmation email is on its way.
      </p>
    </Card>
  );
}

function Card({
  children,
  align = 'center',
}: {
  children: React.ReactNode;
  align?: 'center' | 'left';
}) {
  return (
    <div
      className={`rounded-3xl border border-surface-border bg-surface/40 p-10 sm:p-14 ${
        align === 'center' ? 'text-center' : ''
      }`}
    >
      {children}
    </div>
  );
}

function Icon({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'brand' | 'success' | 'warm';
}) {
  const t =
    tone === 'success'
      ? 'bg-[#00C896]/15 text-[#00C896]'
      : tone === 'warm'
        ? 'bg-[#FF7675]/15 text-[#FF9090]'
        : 'bg-brand-500/15 text-brand-300';
  return (
    <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${t}`}>
      {children}
    </span>
  );
}
