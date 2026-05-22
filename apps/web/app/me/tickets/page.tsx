'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Calendar, Ticket } from 'lucide-react';
import { ApiError } from '@/lib/auth';
import { registrationApi, type PublicTicket } from '@/lib/registration';

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<PublicTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    registrationApi
      .myTickets()
      .then((t) => {
        if (!cancelled) setTickets(t);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setError('signed-out');
        } else {
          setError((err as Error).message ?? 'Could not load your tickets.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="relative min-h-screen bg-surface-deep text-ink-primary">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[420px] w-[920px] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="relative mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>

        <header className="mb-10">
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">My tickets</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything in one place.
          </h1>
        </header>

        {error === 'signed-out' ? (
          <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center">
            <p className="text-base font-semibold text-ink-primary">You are signed out.</p>
            <p className="mt-2 text-sm text-ink-secondary">
              Sign in with the email you used to register to see your tickets.
            </p>
            <Link
              href="/login?next=/me/tickets"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-7 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
            >
              Sign in <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[#FF7675]/30 bg-[#FF7675]/5 p-6 text-sm text-[#FF9090]">
            {error}
          </div>
        ) : !tickets ? (
          <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center text-sm text-ink-secondary">
            Loading tickets...
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center">
            <p className="text-base font-semibold text-ink-primary">No tickets yet.</p>
            <p className="mt-2 text-sm text-ink-secondary">
              Once you register for an event, your ticket appears here.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/t/${t.code}`}
                  className="flex items-center justify-between rounded-2xl border border-surface-border bg-surface/40 px-6 py-5 transition hover:border-brand-500/40"
                >
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-brand-300">
                      {t.tier.name}
                    </div>
                    <div className="mt-1 text-base font-semibold text-ink-primary">
                      {t.event.title}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-secondary">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        {new Date(t.event.startAt).toLocaleDateString('en-GB', {
                          weekday: 'short',
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          timeZone: t.event.timezone,
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Ticket className="h-3 w-3" />
                        {t.code}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-secondary" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
