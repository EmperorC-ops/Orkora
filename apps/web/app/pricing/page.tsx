import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Globe2,
  Download,
} from 'lucide-react';
import { PRICING_TIERS, PRICING_FOOTNOTE, type PricingTier } from '@/lib/pricing';

/**
 * Public pricing page. Renders the committed rate card from lib/pricing.ts
 * (the single source of truth for tiers). The shape and rhythm mirror
 * app/page.tsx so the brand feels continuous.
 */

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Simple pricing for premium events. Free events are always free. Standard, Pro, and Enterprise plans with multi-currency checkout in USD, NGN, GHS, and KES.',
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-surface-deep text-ink-primary">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[480px] w-[920px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-[420px] w-[420px] rounded-full bg-brand-700/10 blur-3xl" />

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-gradient" />
          <span className="text-base font-semibold tracking-tight">Orkora</span>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-12 pt-12 text-center lg:pt-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-300 backdrop-blur">
          Your brand. Our engine.
        </span>
        <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Pricing that scales with your events.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-secondary">
          One platform for registration, tickets, global payments, and your brand. Free events are always free. Paid events pay as you grow, and your attendees never see a surprise fee.
        </p>
      </section>

      {/* Plans */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {PRICING_TIERS.map((tier) => (
            <PlanCard key={tier.id} tier={tier} />
          ))}
        </div>
        <p className="mx-auto mt-6 max-w-3xl text-center text-xs text-ink-muted">
          {PRICING_FOOTNOTE}
        </p>
      </section>

      {/* Trust strip */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-16">
        <div className="rounded-3xl border border-surface-border bg-surface/40 p-8 sm:p-10">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-secondary">
            What you get on every plan
          </p>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <TrustItem
              Icon={ShieldCheck}
              title="Provider-hosted card payments"
              body="Card data is handled by your payment provider. Orkora never touches a card number."
            />
            <TrustItem
              Icon={Globe2}
              title="USD, NGN, GHS, KES checkout"
              body="Real local-currency settlement. Naira and cedi are not afterthoughts on Orkora."
            />
            <TrustItem
              Icon={Download}
              title="Your data is yours"
              body="Export attendees, orders, and registrations at any time. No lock-in."
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-24">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">FAQ</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Pricing, in plain language.
          </h2>
        </div>
        <div className="mt-10 space-y-3">
          <Faq
            q="Are free events really free?"
            a="Yes. If your event sells only $0 tickets, Orkora charges no per-ticket fee. Free events are how organizers build communities, and we are not in the business of taxing community."
          />
          <Faq
            q="How is the per-ticket fee charged?"
            a="It applies to paid tickets only and is taken from your organizer settlement, never added on top of the price your attendee pays. The price you set on a ticket tier is the price the attendee sees."
          />
          <Faq
            q="What about Stripe, Paystack, and Flutterwave fees?"
            a="Those are paid directly to the payment provider at the provider's published rate. Orkora does not mark them up, and we show the full breakdown on every order."
          />
          <Faq
            q="What is the difference between Standard and Pro?"
            a="Standard has everything you need to run and sell a paid event. Pro adds the brand layer, your own Brand Home, Story Mode event pages, custom domains, shareable cards, and campaigns to your subscribers, plus a lower per-ticket rate as you grow."
          />
          <Faq
            q="When do I need Enterprise?"
            a="When you are running at high volume or across multiple entities and want multi-currency reconciliation at scale, volume rates, enterprise authentication, and a contract tailored to you. Talk to us and we will build a plan around your numbers."
          />
          <Faq
            q="Can I leave with my data?"
            a="Yes. Attendees, orders, registrations, and check-in records are all exportable from the dashboard. We treat data export as a feature, not a churn risk."
          />
        </div>

        <div className="mt-16 text-center">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-8 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
          >
            Start free <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-3 text-sm text-ink-secondary">
            Or{' '}
            <Link href="/contact" className="text-brand-300 hover:text-brand-200">
              talk to sales
            </Link>{' '}
            about Pro and Enterprise.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-surface-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-brand-gradient" />
            <span className="text-sm font-semibold tracking-tight">Orkora</span>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-ink-secondary"
          >
            <Link href="/pricing" className="transition hover:text-ink-primary">
              Pricing
            </Link>
            <Link href="/legal/terms" className="transition hover:text-ink-primary">
              Terms
            </Link>
            <Link href="/legal/privacy" className="transition hover:text-ink-primary">
              Privacy
            </Link>
            <Link href="/legal/refunds" className="transition hover:text-ink-primary">
              Refunds
            </Link>
            <Link href="/legal/organizer" className="transition hover:text-ink-primary">
              Organizer Agreement
            </Link>
          </nav>
          <p className="text-xs text-ink-muted">
            &copy; {new Date().getFullYear()} Orkora. Orchestrating every moment.
          </p>
        </div>
      </footer>
    </main>
  );
}

function PlanCard({ tier }: { tier: PricingTier }) {
  const highlighted = !!tier.highlighted;
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-3xl p-8 sm:p-9 ${
        highlighted
          ? 'border border-brand-500/50 bg-gradient-to-br from-brand-500/10 via-surface/40 to-surface-deep'
          : 'border border-surface-border bg-surface/40'
      }`}
    >
      {highlighted && (
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl" />
      )}
      {tier.badge && (
        <span className="absolute right-6 top-6 rounded-full bg-brand-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-200">
          {tier.badge}
        </span>
      )}

      <h2 className="text-2xl font-semibold tracking-tight">{tier.name}</h2>
      <p className="mt-2 min-h-[2.5rem] text-sm text-ink-secondary">{tier.tagline}</p>

      <div className="mt-6">
        {tier.basePrice && (
          <div className="text-4xl font-semibold tracking-tight">{tier.basePrice}</div>
        )}
        <div className={tier.basePrice ? 'mt-1 flex items-baseline gap-2' : 'flex items-baseline gap-2'}>
          <span
            className={
              tier.basePrice
                ? 'text-lg font-semibold text-ink-primary'
                : 'text-4xl font-semibold tracking-tight'
            }
          >
            {tier.rate}
          </span>
          <span className="text-sm text-ink-secondary">{tier.rateUnit}</span>
        </div>
      </div>

      <ul className="mt-7 flex-1 space-y-3 text-sm">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-brand-300" />
            <span className="text-ink-primary">{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <Link
          href={tier.cta.href}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition ${
            highlighted
              ? 'bg-brand-gradient text-white shadow-glow hover:opacity-95'
              : 'border border-white/15 text-ink-primary hover:bg-white/5'
          }`}
        >
          {tier.cta.label}
          {highlighted && <ArrowRight className="h-4 w-4" />}
        </Link>
      </div>
    </div>
  );
}

function TrustItem({
  Icon,
  title,
  body,
}: {
  Icon: typeof ShieldCheck;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-ink-primary">{title}</p>
        <p className="mt-1 text-sm text-ink-secondary">{body}</p>
      </div>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-2xl border border-surface-border bg-surface/40 p-5 transition open:border-brand-500/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-ink-primary">
        {q}
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-white/10 text-ink-secondary transition group-open:rotate-45">
          +
        </span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{a}</p>
    </details>
  );
}
