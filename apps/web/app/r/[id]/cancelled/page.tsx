'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, XCircle } from 'lucide-react';
import { paymentsApi, type OrderStatusView } from '@/lib/registration';

export default function CancelledOrderPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? '';
  const [order, setOrder] = useState<OrderStatusView | null>(null);

  useEffect(() => {
    if (!orderId) return;
    paymentsApi.getOrder(orderId).then(setOrder).catch(() => null);
  }, [orderId]);

  return (
    <main className="relative min-h-screen bg-surface-deep text-ink-primary">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[420px] w-[920px] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="relative mx-auto max-w-2xl px-6 py-20">
        <Link
          href="/"
          className="mb-12 inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <div className="rounded-3xl border border-surface-border bg-surface/40 p-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FF7675]/15 text-[#FF9090]">
            <XCircle className="h-6 w-6" />
          </span>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">Checkout was cancelled.</h1>
          <p className="mt-4 text-sm text-ink-secondary">
            Your seats are released. You can try again from the event page whenever you are ready.
          </p>
          {order?.event ? (
            <Link
              href={`/e/${order.event.code}/register`}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-7 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
            >
              Try again <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
