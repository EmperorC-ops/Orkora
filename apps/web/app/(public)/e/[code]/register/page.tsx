'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Plus, Trash2, Calendar, Ticket } from 'lucide-react';
import { ApiError } from '@/lib/auth';
import {
  type AttendeeInput,
  type PaymentMethod,
  paymentsApi,
  registrationApi,
  formatMoney,
  formatEventDates,
} from '@/lib/registration';

interface PublicTier {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  quantityTotal: number | null;
  quantitySold: number;
  minPerOrder: number;
  maxPerOrder: number;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  isGroup: boolean;
  groupSize: number | null;
  position: number;
}

interface PublicEventLite {
  id: string;
  title: string;
  code: string;
  startAt: string;
  endAt: string;
  bannerUrl: string | null;
  timezone: string;
  tiers: PublicTier[];
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function RegisterPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = params?.code ?? '';

  const [event, setEvent] = useState<PublicEventLite | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tierId, setTierId] = useState<string>('');
  const [attendees, setAttendees] = useState<AttendeeInput[]>([
    { fullName: '', email: '', phone: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/v1/events/by-code/${encodeURIComponent(code)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Event not found');
        return r.json() as Promise<PublicEventLite>;
      })
      .then((e) => {
        if (cancelled) return;
        const safe: PublicEventLite = { ...e, tiers: e.tiers ?? [] };
        setEvent(safe);
        const first = [...safe.tiers].sort((a, b) => a.position - b.position)[0];
        if (first) setTierId(first.id);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const tier = useMemo(
    () => event?.tiers?.find((t) => t.id === tierId) ?? null,
    [event, tierId],
  );

  const remaining = useMemo(() => {
    if (!tier) return null;
    if (tier.quantityTotal === null) return null;
    return Math.max(0, tier.quantityTotal - tier.quantitySold);
  }, [tier]);

  const isFree = tier ? tier.priceMinor === 0 : false;
  const total = tier ? tier.priceMinor * attendees.length : 0;

  function updateAttendee(i: number, patch: Partial<AttendeeInput>) {
    setAttendees((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  function addAttendee() {
    if (!tier) return;
    if (attendees.length >= tier.maxPerOrder) return;
    setAttendees((prev) => [...prev, { fullName: '', email: '', phone: '' }]);
  }

  function removeAttendee(i: number) {
    setAttendees((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tier) return;
    setSubmitting(true);
    setSubmitError(null);

    let paymentMethod: PaymentMethod = 'free';
    if (!isFree) {
      // Ask the API which provider it wants to use for this currency. Falls
      // back to whatever it returns; if nothing is configured we surface a
      // clear message rather than letting the registration call fail later.
      try {
        const recommended = await paymentsApi.methods(tier.currency);
        if (!recommended.recommended) {
          setSubmitError(
            'Online payments are not yet configured on this server. Free tickets are available now.',
          );
          setSubmitting(false);
          return;
        }
        paymentMethod = recommended.recommended as PaymentMethod;
      } catch {
        setSubmitError('Could not reach the payments service.');
        setSubmitting(false);
        return;
      }
    }
    try {
      const result = await registrationApi.register(code, {
        tierId: tier.id,
        attendees: attendees.map((a) => ({
          fullName: a.fullName.trim(),
          email: a.email.trim(),
          phone: a.phone?.trim() || undefined,
        })),
        paymentMethod,
      });

      if (isFree) {
        // Free flow: jump to confirmation with the first ticket code.
        const firstCode = result.tickets[0]?.code;
        if (firstCode) {
          router.push(`/t/${firstCode}`);
          return;
        }
      } else {
        // Paid flow: ask the API to mint a checkout URL for the pending
        // order, then send the browser there. The provider redirects back to
        // /r/[orderId]/confirm on success.
        if (!result.order) {
          throw new Error('Server did not return an order for the paid flow');
        }
        try {
          const { url } = await paymentsApi.startCheckout(result.order.id);
          window.location.href = url;
          return;
        } catch (err) {
          if (err instanceof ApiError && err.status === 400) {
            setSubmitError(
              'Online payments are not yet configured on this server. Free tickets are available now.',
            );
          } else {
            throw err;
          }
        }
      }
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
          <h1 className="text-2xl font-semibold tracking-tight">Event not found</h1>
          <p className="mt-3 text-sm text-ink-secondary">
            The code <span className="font-mono">{code}</span> does not match a published event.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 text-sm text-brand-300 hover:text-brand-200"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </Wrapper>
    );
  }

  if (!event) {
    return (
      <Wrapper>
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center text-sm text-ink-secondary">
          Loading event...
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Link
        href={`/e/${event.code}`}
        className="mb-8 inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to event
      </Link>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <header>
            <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Register</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {event.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-secondary">
              <span className="inline-flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {formatEventDates(event.startAt, event.endAt)}
              </span>
              <span className="font-mono text-xs uppercase tracking-wider">{event.code}</span>
            </div>
          </header>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
              Choose a ticket
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[...(event.tiers ?? [])]
                .sort((a, b) => a.position - b.position)
                .map((t) => {
                  const r = t.quantityTotal === null ? null : t.quantityTotal - t.quantitySold;
                  const soldOut = r !== null && r <= 0;
                  const selected = t.id === tierId;
                  return (
                    <button
                      type="button"
                      key={t.id}
                      disabled={soldOut}
                      onClick={() => setTierId(t.id)}
                      className={`relative rounded-2xl border p-5 text-left transition ${
                        selected
                          ? 'border-brand-500 bg-brand-500/10'
                          : 'border-surface-border bg-surface/40 hover:border-brand-500/40'
                      } ${soldOut ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-ink-primary">{t.name}</h3>
                          {t.description && (
                            <p className="mt-1 text-sm text-ink-secondary">{t.description}</p>
                          )}
                        </div>
                        <Ticket className="h-4 w-4 text-brand-300" />
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-lg font-semibold text-ink-primary">
                          {t.priceMinor === 0 ? 'Free' : formatMoney(t.priceMinor, t.currency)}
                        </span>
                        {soldOut ? (
                          <span className="text-xs font-semibold uppercase tracking-wider text-[#FF9090]">
                            Sold out
                          </span>
                        ) : r !== null ? (
                          <span className="text-xs text-ink-muted">{r} left</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
            </div>
          </section>

          <form onSubmit={handleSubmit} className="space-y-6">
            <section>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
                  Attendee details
                </h2>
                {tier && attendees.length < tier.maxPerOrder && (
                  <button
                    type="button"
                    onClick={addAttendee}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300 transition hover:text-brand-200"
                  >
                    <Plus className="h-3 w-3" /> Add attendee
                  </button>
                )}
              </div>
              <div className="mt-4 space-y-4">
                {attendees.map((a, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-surface-border bg-surface/40 p-5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                        Attendee {i + 1}
                      </span>
                      {attendees.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeAttendee(i)}
                          className="text-xs text-ink-muted transition hover:text-[#FF9090]"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field
                        label="Full name"
                        value={a.fullName}
                        onChange={(v) => updateAttendee(i, { fullName: v })}
                        required
                      />
                      <Field
                        label="Email"
                        type="email"
                        value={a.email}
                        onChange={(v) => updateAttendee(i, { email: v })}
                        required
                      />
                      <Field
                        label="Phone (optional)"
                        value={a.phone ?? ''}
                        onChange={(v) => updateAttendee(i, { phone: v })}
                        className="sm:col-span-2"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {submitError && (
              <p className="rounded-xl border border-[#FF7675]/30 bg-[#FF7675]/10 px-4 py-3 text-sm text-[#FF9090]">
                {submitError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !tier || (remaining !== null && attendees.length > remaining)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-gradient py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95 disabled:opacity-50"
            >
              {submitting
                ? 'Processing...'
                : isFree
                  ? `Register ${attendees.length} attendee${attendees.length > 1 ? 's' : ''}`
                  : `Continue to payment ${tier ? formatMoney(total, tier.currency) : ''}`}{' '}
              <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-center text-xs text-ink-muted">
              By registering you agree to receive event communications from the organizer.
            </p>
          </form>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-2xl border border-surface-border bg-surface/40 p-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Order summary
            </h3>
            {tier ? (
              <>
                <div className="mt-4 flex items-baseline justify-between">
                  <span className="text-sm text-ink-secondary">{tier.name}</span>
                  <span className="text-sm text-ink-primary">
                    {tier.priceMinor === 0 ? 'Free' : formatMoney(tier.priceMinor, tier.currency)}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-sm text-ink-secondary">Quantity</span>
                  <span className="text-sm text-ink-primary">{attendees.length}</span>
                </div>
                <div className="mt-4 flex items-baseline justify-between border-t border-surface-border pt-4">
                  <span className="text-sm font-semibold text-ink-primary">Total</span>
                  <span className="text-lg font-semibold text-ink-primary">
                    {tier.priceMinor === 0 ? 'Free' : formatMoney(total, tier.currency)}
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-ink-muted">Select a ticket to continue.</p>
            )}
          </div>
        </aside>
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
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
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
  // The API returns RFC 7807 problem+json. Try to surface the detail.
  try {
    const parsed = JSON.parse(err.message) as { detail?: string };
    if (parsed.detail) return parsed.detail;
  } catch {
    // Not JSON, fall through.
  }
  if (err.status === 409) return 'Not enough tickets remaining in this tier.';
  if (err.status === 400) return 'Some details are invalid. Please check the form and try again.';
  if (err.status === 404) return 'Event or tier not found.';
  return err.message || 'Something went wrong.';
}
