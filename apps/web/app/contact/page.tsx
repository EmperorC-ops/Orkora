'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Mail, CheckCircle2 } from 'lucide-react';
import { Brand } from '@/components/brand';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Placeholder. Wire to a real inbound (resend.com webhook, Postmark, or HubSpot)
    // when sales tooling is chosen. For now this is intentionally local.
    setSubmitted(true);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-surface-deep text-ink-primary">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[480px] w-[920px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center" aria-label="Orkora home">
          <Brand variant="lockup" width={600} priority className="h-40 w-auto" />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      </header>

      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Request a demo</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            See Orkora in motion.
          </h1>
          <p className="mt-6 max-w-md text-base text-ink-secondary sm:text-lg">
            Tell us about the event you are running. We will walk you through the system, configure
            a working demo against your structure, and answer everything before you commit.
          </p>
          <ul className="mt-10 space-y-3 text-sm text-ink-secondary">
            <ContactPoint label="A 30 minute walk-through, focused on your specific event shape." />
            <ContactPoint label="A live sandbox with your branding, agenda, and tickets." />
            <ContactPoint label="A technical Q&A with someone who has actually run the platform." />
          </ul>
          <p className="mt-12 text-xs uppercase tracking-[0.18em] text-ink-muted">
            Or reach us directly
          </p>
          <a
            href="mailto:hello@orkora.events"
            className="mt-2 inline-flex items-center gap-2 text-sm text-ink-primary hover:text-brand-300"
          >
            <Mail className="h-4 w-4" /> hello@orkora.events
          </a>
        </div>

        <div className="rounded-3xl border border-surface-border bg-surface/40 p-8 sm:p-10">
          {submitted ? (
            <div className="flex h-full flex-col items-center justify-center py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00C896]/15 text-[#00C896]">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <h2 className="mt-6 text-2xl font-semibold tracking-tight">Request received.</h2>
              <p className="mt-3 max-w-sm text-sm text-ink-secondary">
                A member of the Orkora team will respond within one business day. If your event is
                imminent, mention it in your reply and we will route you to a real human faster.
              </p>
              <Link
                href="/"
                className="mt-8 inline-flex items-center gap-2 text-sm text-brand-300 hover:text-brand-200"
              >
                Back to home <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Field label="Full name" name="fullName" placeholder="Your name" required />
              <Field
                label="Work email"
                name="email"
                type="email"
                placeholder="you@company.com"
                required
              />
              <Field label="Organization" name="org" placeholder="Company or event name" required />
              <Select label="Event size" name="size" options={['Under 200', '200 to 1,000', '1,000 to 5,000', 'Over 5,000']} />
              <Textarea
                label="Tell us about your event"
                name="notes"
                placeholder="What kind of event, when, what is most important to get right."
              />
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-gradient py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
              >
                Request a demo <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-center text-xs text-ink-muted">
                We respond within one business day. No automated drip.
              </p>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function ContactPoint({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-brand-300" />
      <span>{label}</span>
    </li>
  );
}

function Field({
  label,
  name,
  type = 'text',
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-surface-border bg-surface-deep/60 px-4 py-3 text-sm text-ink-primary placeholder-ink-muted outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
      />
    </label>
  );
}

function Textarea({
  label,
  name,
  placeholder,
}: {
  label: string;
  name: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <textarea
        name={name}
        rows={4}
        placeholder={placeholder}
        className="w-full resize-none rounded-xl border border-surface-border bg-surface-deep/60 px-4 py-3 text-sm text-ink-primary placeholder-ink-muted outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
      />
    </label>
  );
}

function Select({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <select
        name={name}
        className="w-full rounded-xl border border-surface-border bg-surface-deep/60 px-4 py-3 text-sm text-ink-primary outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
        defaultValue=""
      >
        <option value="" disabled>
          Select size
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
