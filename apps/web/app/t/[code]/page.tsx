'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calendar, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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
                  timeZone: ticket.event.timezone,
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
 * Real, scannable QR renderer. Encodes the HMAC-signed `qrToken` string with
 * error-correction level H (30% redundancy) so it still decodes when the
 * screen is dim, glary, or partially obscured at the door. Level H is what
 * boarding passes and event scanners target.
 *
 * The `qrToken` payload is a base64url-encoded, HMAC-signed `{t: ticketId,
 * e: eventId}` produced by TicketSigner on the API (see
 * apps/api/src/modules/registrations/registrations.service.ts:828). The
 * check-in scanner (apps/web/app/(organizer)/dashboard/events/[id]/checkin)
 * uses the `qr-scanner` npm package to decode the token from the camera and
 * POSTs it to `/v1/organizations/:orgId/events/:eventId/checkin`, where
 * `TicketSigner.verify()` validates it before flipping `checkedInAt`.
 */
function QrSvg({ value }: { value: string }) {
  return (
    <QRCodeSVG
      value={value}
      level="H"
      includeMargin={false}
      className="h-full w-full"
      // Explicit fg/bg keep the QR high-contrast on the white card even if
      // an ancestor sets `currentColor` from the dark theme.
      fgColor="#000000"
      bgColor="#FFFFFF"
    />
  );
}
