import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Globe2,
  Download,
  Sparkles,
} from 'lucide-react';

/**
 * Public pricing page.
 *
 * Orkora is in private beta. We deliberately do not commit to a precise rate
 * card before we have enough live volume to know our true settlement cost on
 * each provider (Stripe, Paystack, Flutterwave). What we DO commit to in this
 * page is the model (free events stay free; paid events pay a small per-
 * ticket fee), the ceiling (we promise the rate will be lower than
 * Eventbrite's 3.7% + $1.79 on paid tickets at launch), and the principle
 * (free organizers pay nothing, attendees never get hit with surprise fees).
 *
 * The shape and rhythm mirror app/page.tsx so the brand feels continuous.
 */
export default function PricingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-surface-deep text-ink-primary">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[480px] w-[920px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-[-10%] h-[420px] w-[420px] rounded-full bg-[#FF7675]/10 blur-3xl" />

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
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-ink-secondary backdrop-blur">
          <Sparkles className="h-3 w-3 text-brand-300" />
          Private beta
        </span>
        <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Free during beta. Honest after.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-secondary">
          Orkora is free to use while we are in private beta. After general availability, free events stay free forever and paid events pay a small per-ticket fee that is lower than Eventbrite at launch. No setup costs, no monthly minimums, no surprise charges on your attendees.
        </p>
      </section>

      {/* Plans */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-16">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Beta plan */}
          <div className="relative overflow-hidden rounded-3xl border border-brand-500/40 bg-gradient-to-br from-brand-500/10 via-surface/40 to-surface-deep p-8 sm:p-10">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
              Available today
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Beta</h2>
            <p className="mt-2 text-sm text-ink-secondary">
              For organizers running events while we finish our public launch.
            </p>
            <div className="mt-7 flex items-baseline gap-2">
              <span className="text-5xl font-semibold tracking-tight">Free</span>
              <span className="text-sm text-ink-secondary">while in private beta</span>
            </div>
            <ul className="mt-7 space-y-3 text-sm text-ink-primary">
              <PricingFeature label="Unlimited free events" />
              <PricingFeature label="Unlimited paid events (no Orkora fee during beta)" />
              <PricingFeature label="Stripe, Paystack, Flutterwave checkout" />
              <PricingFeature label="USD, NGN, GHS, KES at first-class rates" />
              <PricingFeature label="Refunds, receipts, and tickets out of the box" />
              <PricingFeature label="Live chat, questions, and polls during the event" />
              <PricingFeature label="Real-time dashboard for organizers" />
              <PricingFeature label="Data export at any time" />
            </ul>
            <div className="mt-9">
              <Link
                href="/signup"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-gradient py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
              >
                Request beta access <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-3 text-center text-xs text-ink-muted">
                Payment provider fees (Stripe / Paystack / Flutterwave) still apply at their published rates.
              </p>
            </div>
          </div>

          {/* Post-beta plan */}
          <div className="relative overflow-hidden rounded-3xl border border-surface-border bg-surface/40 p-8 sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-secondary">
              At general availability
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Standard</h2>
            <p className="mt-2 text-sm text-ink-secondary">
              For organizers running paid events after our public launch.
            </p>
            <div className="mt-7">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-semibold tracking-tight">$0</span>
                <span className="text-sm text-ink-secondary">on free events, forever</span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight text-ink-secondary">
                  Lower than Eventbrite
                </span>
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                A per-ticket fee on paid tickets only. The exact rate is announced before any organizer is billed, and we publicly commit to staying below Eventbrite&apos;s 3.7% + $1.79 on paid tickets at launch.
              </p>
            </div>
            <ul className="mt-7 space-y-3 text-sm text-ink-primary">
              <PricingFeature label="Everything in Beta" />
              <PricingFeature label="No monthly minimums" />
              <PricingFeature label="No setup fees" />
              <PricingFeature label="No charge on free events, ever" />
              <PricingFeature label="No surprise attendee fees" />
              <PricingFeature label="Volume rates for high-throughput organizers" muted />
            </ul>
            <div className="mt-9">
              <Link
                href="/contact"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 py-3 text-sm font-semibold text-ink-primary transition hover:bg-white/5"
              >
                Talk to us about volume pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-16">
        <div className="rounded-3xl border border-surface-border bg-surface/40 p-8 sm:p-10">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-secondary">
            What you get either way
          </p>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <TrustItem
              Icon={ShieldCheck}
              title="PCI DSS Level 1 payments"
              body="Card data is handled by Stripe and Paystack. Orkora never touches a card number."
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
            q="Is Orkora really free for free events, forever?"
            a="Yes. If your event sells $0 tickets, Orkora charges you nothing. Forever. Free events are how organizers build communities, and we are not in the business of taxing community."
          />
          <Faq
            q="What about Stripe, Paystack, and Flutterwave fees?"
            a="Those are paid directly to the payment provider at the provider's published rate. Orkora does not mark them up. Stripe is typically 2.9% + $0.30 in the US and 1.5% + $0.20 for European cards. Paystack and Flutterwave list their rates publicly per market. We surface the full breakdown on every order."
          />
          <Faq
            q="When does the beta end and how will I know?"
            a="We will email every beta organizer at least 60 days before any per-ticket fee is introduced, with the exact rate, the effective date, and a 30-day grace period for any event you have already published. No organizer will ever be surprised by an invoice."
          />
          <Faq
            q="Will my attendees see extra fees at checkout?"
            a="Not from Orkora. The price you set on a ticket tier is the price the attendee pays. After GA, the Orkora per-ticket fee is taken from your organizer settlement, not added on top of the attendee price. Payment-provider processing fees are also paid out of your settlement by default; you can choose to pass them on if you prefer."
          />
          <Faq
            q="What happens to refunds?"
            a="Refunds are issued through the same provider that processed the payment, and you can trigger them from the Orkora dashboard with one click. The attendee receives an email confirmation and their ticket QR is voided automatically."
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
            Request beta access <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-3 text-sm text-ink-secondary">
            Or{' '}
            <Link href="/contact" className="text-brand-300 hover:text-brand-200">
              talk to us
            </Link>{' '}
            if you have a larger event in mind.
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

function PricingFeature({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <CheckCircle2 className={`mt-0.5 h-4 w-4 flex-none ${muted ? 'text-ink-muted' : 'text-brand-300'}`} />
      <span className={muted ? 'text-ink-secondary' : 'text-ink-primary'}>{label}</span>
    </li>
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
