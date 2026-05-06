'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calendar, CheckCircle2 } from 'lucide-react';
import { registrationApi, type PublicTicket } from '@/lib/registration';

export default function TicketPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code ?? '';
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    registrationApi
      .getTicket(code)
      .then((t) => {
        if (!cancelled) setTicket(t);
      })
      .catch(() => {
        if (!cancelled) setError('We could not load this ticket.');
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

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

        {error ? (
          <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Ticket not found</h1>
            <p className="mt-3 text-sm text-ink-secondary">{error}</p>
          </div>
        ) : !ticket ? (
          <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center text-sm text-ink-secondary">
            Loading ticket...
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-surface-border bg-gradient-to-br from-brand-500/15 via-surface/40 to-surface/40 p-8 text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#00C896]/15 px-3 py-1 text-xs font-semibold text-[#00C896]">
                <CheckCircle2 className="h-3 w-3" />
                {ticket.status === 'issued' ? 'Issued' : ticket.status}
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                {ticket.event.title}
              </h1>
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-ink-secondary">
                <Calendar className="h-4 w-4" />
                {new Date(ticket.event.startAt).toLocaleString('en-GB', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                <Row label="Holder" value={ticket.holderName} />
                <Row label="Email" value={ticket.holderEmail} />
                <Row label="Tier" value={ticket.tier.name} />
                <Row label="Ticket code" value={ticket.code} mono />
                <Row label="Event code" value={ticket.event.code} mono />
              </div>
              <div className="rounded-2xl border border-surface-border bg-white p-6 text-center text-slate-900">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Scan at entry
                </p>
                <div className="mx-auto mt-4 aspect-square max-w-[220px]">
                  <QrSvg value={ticket.qrToken} />
                </div>
                <p className="mt-3 font-mono text-[11px] text-slate-500">{ticket.code}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface/40 p-5">
      <div className="text-xs uppercase tracking-wider text-ink-muted">{label}</div>
      <div className={`mt-1 ${mono ? 'font-mono text-sm' : 'text-base'} text-ink-primary`}>
        {value}
      </div>
    </div>
  );
}

/**
 * Minimal QR renderer. We embed a small numeric matrix derived from a hash of
 * the token so the page can render without a runtime dependency. Scanners
 * built for production will read the token directly through `qrToken`; this
 * SVG is a visual proxy until we add a real qrcode library (issue: defer to
 * Slice 3.2 since the mobile app uses a real QR library natively).
 */
function QrSvg({ value }: { value: string }) {
  const size = 25;
  const cells: boolean[] = [];
  // Deterministic pseudo-random fill from the value.
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  for (let i = 0; i < size * size; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    cells.push((h & 1) === 1);
  }
  // Force the three corner finder squares (visual cue).
  const finder = (cx: number, cy: number) => {
    for (let y = -3; y <= 3; y++) {
      for (let x = -3; x <= 3; x++) {
        const px = cx + x;
        const py = cy + y;
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        const onBorder = Math.abs(x) === 3 || Math.abs(y) === 3;
        const onCenter = Math.abs(x) <= 1 && Math.abs(y) <= 1;
        cells[py * size + px] = onBorder || onCenter;
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
      <rect width={size} height={size} fill="white" />
      {cells.map((on, i) =>
        on ? <rect key={i} x={i % size} y={Math.floor(i / size)} width={1} height={1} fill="black" /> : null,
      )}
    </svg>
  );
}
