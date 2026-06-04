import Link from 'next/link';
import {
  ArrowRight,
  Calendar,
  Activity,
  Users,
  BarChart3,
  CheckCircle2,
  QrCode,
  Radio,
  TicketCheck,
  Sparkles,
  ShieldCheck,
  Globe2,
  Download,
} from 'lucide-react';
import HeroDashboardLive from './_components/HeroDashboardLive';
import { Brand } from '@/components/brand';

const capabilities = [
  {
    Icon: Calendar,
    title: 'Plan with clarity',
    body: 'Create events, manage registrations, and structure every session with precision.',
    accent: 'from-brand-500 to-brand-700',
  },
  {
    Icon: Activity,
    title: 'Operate in real time',
    body: 'Track attendance, push updates, and adjust instantly as things evolve.',
    accent: 'from-[#FF7675] to-[#FF5757]',
  },
  {
    Icon: Users,
    title: 'Engage with purpose',
    body: 'Keep attendees informed, involved, and moving in sync with the event.',
    accent: 'from-[#00C896] to-[#00A074]',
  },
  {
    Icon: BarChart3,
    title: 'Measure what matters',
    body: 'Access live data and post-event insights without guesswork.',
    accent: 'from-[#5B8DEF] to-[#3F69D1]',
  },
];

const howItWorks = [
  {
    step: '01',
    title: 'Set up your event',
    body: 'Customize registration, tickets, agenda, and branding.',
    visual: <SetupVisual />,
  },
  {
    step: '02',
    title: 'Run everything from one system',
    body: 'Coordinate teams, attendees, and sessions in real time.',
    visual: <OperateVisual />,
  },
  {
    step: '03',
    title: 'Close with clarity',
    body: 'Track performance, engagement, and outcomes in one place.',
    visual: <CloseVisual />,
  },
];

const experiencePoints = [
  { Icon: Calendar, label: 'Clear schedules' },
  { Icon: Radio, label: 'Instant updates' },
  { Icon: TicketCheck, label: 'Seamless entry and movement' },
];

const audiences = [
  'Corporate conferences',
  'Industry summits',
  'Private high-value gatherings',
];

export default function MarketingHome() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-surface-deep text-ink-primary">
      <BackgroundGlow />

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center" aria-label="Orkora home">
          <Brand variant="lockup" width={640} priority className="h-40 w-auto" />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-ink-secondary md:flex">
          <a href="#capabilities" className="transition hover:text-ink-primary">
            Capabilities
          </a>
          <a href="#how-it-works" className="transition hover:text-ink-primary">
            How it works
          </a>
          <a href="#built-for" className="transition hover:text-ink-primary">
            Built for
          </a>
          <Link href="/pricing" className="transition hover:text-ink-primary">
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-ink-secondary transition hover:text-ink-primary">
            Sign in
          </Link>
        </div>
      </header>

      {/* 1. HERO */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-16 lg:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-ink-secondary backdrop-blur">
              <Sparkles className="h-3 w-3 text-brand-300" />
              The event platform for organizers who run paid events
            </span>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Orchestrate every moment.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-secondary">
              Registration, paid checkout, attendee tickets, and live chat in one place. Built for organizers who sell tickets in dollars, naira, cedi, and shillings, side by side.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-7 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
              >
                Start planning <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="rounded-full border border-white/15 px-7 py-3 text-sm font-semibold text-ink-primary transition hover:bg-white/5"
              >
                See pricing
              </Link>
            </div>

            {/* Trust strip. The empty logo wall is gone. These three lines
                are the three things organizers actually want to know before
                handing us their ticket revenue: who handles the money, what
                currencies we settle in, and whether they can leave with
                their data. */}
            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-xs text-ink-secondary">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-300" />
                Payments via Stripe and Paystack (PCI DSS Level 1)
              </span>
              <span className="inline-flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-brand-300" />
                USD, NGN, GHS, KES checkout
              </span>
              <span className="inline-flex items-center gap-2">
                <Download className="h-4 w-4 text-brand-300" />
                Export your event data anytime
              </span>
            </div>
          </div>

          <div className="relative">
            {/* Live, looping product preview. Renders client-side and tells
                the 32s story of an event running: counters ticking,
                attendance bars surging, schedule advancing. See
                _components/HeroDashboardLive.tsx for the keyframe details
                and the reduced-motion behavior. */}
            <HeroDashboardLive />
          </div>
        </div>
      </section>

      {/* 2. PROBLEM */}
      <Section>
        <div className="mx-auto max-w-4xl">
          <div className="rounded-3xl border border-surface-border bg-surface/40 p-10 sm:p-14">
            <p className="text-3xl font-semibold leading-snug tracking-tight text-ink-primary sm:text-4xl">
              Events rarely fail at the idea level.{' '}
              <span className="text-ink-secondary">They fail in execution.</span>
            </p>
            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ProblemPoint label="Information arrives too late." />
              <ProblemPoint label="Teams operate in silos." />
              <ProblemPoint label="Attendees experience confusion instead of flow." />
            </div>
            <p className="mt-10 border-t border-surface-border pt-6 text-base text-ink-muted">
              What should feel seamless becomes reactive.
            </p>
          </div>
        </div>
      </Section>

      {/* 3. SHIFT */}
      <Section>
        <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-brand-300">The shift</p>
            <p className="mt-6 text-3xl font-semibold leading-tight tracking-tight text-ink-primary sm:text-4xl">
              An event is not a checklist.{' '}
              <span className="text-ink-secondary">It is a system.</span>
            </p>
            <p className="mt-6 max-w-md text-base text-ink-secondary sm:text-lg">
              When every element is connected and visible in real time, execution stops being
              chaotic and becomes intentional.
            </p>
          </div>
          <div className="relative">
            <ConnectedNodesMock />
          </div>
        </div>
      </Section>

      {/* 4. CAPABILITIES */}
      <Section id="capabilities">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Capabilities</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Built around the work, not the wishlist.
          </h2>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map(({ Icon, title, body, accent }) => (
            <div
              key={title}
              className="group relative overflow-hidden rounded-2xl border border-surface-border bg-surface/40 p-6 transition hover:border-brand-500/40 hover:bg-surface/70"
            >
              <div
                className={`mb-6 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${accent} shadow-lg`}
              >
                <Icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-base font-semibold text-ink-primary">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{body}</p>
              <div className="pointer-events-none absolute -bottom-12 -right-12 h-32 w-32 rounded-full bg-brand-500/0 blur-2xl transition group-hover:bg-brand-500/20" />
            </div>
          ))}
        </div>
      </Section>

      {/* 5. HOW IT WORKS */}
      <Section id="how-it-works">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">How it works</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Three steps. One system.
          </h2>
        </div>
        <div className="mt-16 space-y-16">
          {howItWorks.map(({ step, title, body, visual }, i) => (
            <div
              key={step}
              className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${
                i % 2 === 1 ? 'lg:[&>div:first-child]:order-last' : ''
              }`}
            >
              <div>
                <span className="text-sm font-semibold tracking-[0.18em] text-brand-300">
                  STEP {step}
                </span>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
                  {title}
                </h3>
                <p className="mt-4 max-w-md text-base text-ink-secondary sm:text-lg">{body}</p>
              </div>
              <div className="relative">{visual}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* 6. EXPERIENCE LAYER */}
      <Section>
        <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-surface-border bg-gradient-to-br from-surface/80 via-surface/40 to-surface-deep p-10 sm:p-16">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-brand-300">The experience</p>
              <p className="mt-6 text-3xl font-semibold leading-snug tracking-tight text-ink-primary sm:text-4xl">
                Attendees don&apos;t see systems.{' '}
                <span className="text-ink-secondary">They feel flow.</span>
              </p>
              <ul className="mt-10 space-y-3">
                {experiencePoints.map(({ Icon, label }) => (
                  <li key={label} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-base text-ink-primary">{label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-10 text-base text-ink-muted">Everything works the way it should.</p>
            </div>
            <div className="relative">
              <AttendeePhoneMock />
            </div>
          </div>
        </div>
      </Section>

      {/* 7. SOCIAL PROOF */}
      <Section id="built-for">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-3xl border border-surface-border bg-gradient-to-br from-brand-500/10 via-surface/40 to-surface/40 p-10 text-center sm:p-16">
            <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Built for</p>
            <p className="mx-auto mt-5 max-w-2xl text-2xl font-semibold leading-snug tracking-tight text-ink-primary sm:text-3xl">
              Teams that run events where execution matters.
            </p>
            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {audiences.map((audience) => (
                <div
                  key={audience}
                  className="rounded-xl border border-surface-border bg-surface/60 px-5 py-4 text-sm font-medium text-ink-primary"
                >
                  {audience}
                </div>
              ))}
            </div>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 text-center">
              <p className="text-sm text-ink-secondary">
                In private beta with a focused cohort of organizers. Public sign-ups open soon.
              </p>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-2 text-sm font-semibold text-ink-primary transition hover:bg-white/5"
              >
                Request beta access <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </Section>

      {/* 8. FINAL CTA */}
      <Section last>
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-brand-gradient px-8 py-16 text-center sm:px-16 sm:py-20">
          <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <p className="relative text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
            You don&apos;t manage events.
            <br />
            <span className="text-white/80">You orchestrate them.</span>
          </p>
          <div className="relative mt-10 flex justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              Start with Orkora <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-surface-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <Brand variant="mark" width={20} className="h-5 w-5" />
            <span className="text-sm font-semibold tracking-tight">Orkora</span>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-ink-secondary"
          >
            <Link href="/pricing" className="transition hover:text-ink-primary">
              Pricing
            </Link>
            <Link href="/install" className="transition hover:text-ink-primary">
              Install
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

/* ----------------------------- helpers ----------------------------- */

function Section({
  children,
  id,
  last = false,
}: {
  children: React.ReactNode;
  id?: string;
  last?: boolean;
}) {
  return (
    <section id={id} className={`relative z-10 mx-auto max-w-7xl px-6 ${last ? 'py-32' : 'py-24'}`}>
      {children}
    </section>
  );
}

function BackgroundGlow() {
  return (
    <>
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[1100px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="pointer-events-none absolute right-[-10%] top-[40%] h-[420px] w-[420px] rounded-full bg-[#FF7675]/10 blur-3xl" />
      <div className="pointer-events-none absolute left-[-10%] top-[70%] h-[420px] w-[420px] rounded-full bg-[#00C896]/10 blur-3xl" />
    </>
  );
}

function ProblemPoint({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-surface-border/60 bg-surface-deep/40 p-4 text-left">
      {/* Align the dot's vertical center with the midline of the first line
          of text. With text-sm + leading-6, the first line is 24px tall, so
          its midline sits at y=12. The dot is 8px tall (h-2), so a mt-2
          (8px) push lands the dot's center at y=12 - identical alignment on
          single- and multi-line labels. Without this, the dot anchored to
          the container top and floated several pixels above the text. */}
      <span className="mt-2 inline-block h-2 w-2 flex-none rounded-full bg-[#FF7675]" />
      <span className="text-sm leading-6 text-ink-secondary">{label}</span>
    </div>
  );
}

/* ----------------------------- visuals ----------------------------- */

/* HeroDashboardMock removed: the animated client component
 * _components/HeroDashboardLive.tsx now owns the hero preview and its
 * presentational helpers (StatTile / BarChart / ScheduleRow). */

function SetupVisual() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-surface-border bg-surface/60 p-6 shadow-xl">
      <div className="text-xs font-semibold text-ink-primary">New event</div>
      <div className="mt-4 space-y-3">
        <FieldMock label="Title" value="Summit 2026" />
        <FieldMock label="Date" value="Jun 1 to 2, 2026" />
        <FieldMock label="Capacity" value="500 attendees" />
        <div className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-deep/40 px-3 py-2">
          <span className="text-[10px] text-ink-muted">Tickets</span>
          <div className="flex gap-1.5">
            <span className="rounded-md bg-brand-500/20 px-2 py-0.5 text-[10px] text-brand-300">
              Free
            </span>
            <span className="rounded-md bg-[#FF7675]/20 px-2 py-0.5 text-[10px] text-[#FF9090]">
              Standard
            </span>
            <span className="rounded-md bg-[#00C896]/20 px-2 py-0.5 text-[10px] text-[#00C896]">
              VIP
            </span>
          </div>
        </div>
      </div>
      <button className="mt-5 w-full rounded-full bg-brand-gradient py-2 text-xs font-semibold text-white">
        Save and publish
      </button>
    </div>
  );
}

function FieldMock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-deep/40 px-3 py-2">
      <div className="text-[10px] text-ink-muted">{label}</div>
      <div className="text-xs text-ink-primary">{value}</div>
    </div>
  );
}

function OperateVisual() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-surface-border bg-surface/60 p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-primary">Live operations</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#00C896]/15 px-2 py-1 text-[10px] font-semibold text-[#00C896]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00C896]" /> Live
        </span>
      </div>
      <div className="mt-4 space-y-2.5">
        <FeedRow icon={<TicketCheck className="h-3 w-3" />} text="42 attendees checked in at the main entrance" tone="brand" />
        <FeedRow icon={<Radio className="h-3 w-3" />} text="Update sent to all attendees" tone="success" />
        <FeedRow icon={<QrCode className="h-3 w-3" />} text="Speaker badge scanned at Track B" tone="warm" />
        <FeedRow icon={<CheckCircle2 className="h-3 w-3" />} text="Session 'Future of Africa Tech' started on time" tone="brand" />
      </div>
    </div>
  );
}

function FeedRow({
  icon,
  text,
  tone,
}: {
  icon: React.ReactNode;
  text: string;
  tone: 'brand' | 'success' | 'warm';
}) {
  const t =
    tone === 'brand'
      ? 'bg-brand-500/15 text-brand-300'
      : tone === 'success'
        ? 'bg-[#00C896]/15 text-[#00C896]'
        : 'bg-[#FF7675]/15 text-[#FF9090]';
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-surface-border bg-surface-deep/40 px-3 py-2">
      <span className={`flex h-6 w-6 items-center justify-center rounded-md ${t}`}>{icon}</span>
      <span className="text-xs text-ink-secondary">{text}</span>
    </div>
  );
}

function CloseVisual() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-surface-border bg-surface/60 p-6 shadow-xl">
      <div className="text-xs font-semibold text-ink-primary">Post-event report</div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard label="Total revenue" value="₦12.4M" tone="brand" />
        <MetricCard label="Attendance" value="92%" tone="success" />
        <MetricCard label="Engagement" value="4.7 / 5" tone="warm" />
        <MetricCard label="NPS" value="+58" tone="cool" />
      </div>
      <div className="mt-4 rounded-lg border border-surface-border bg-surface-deep/40 p-3">
        <div className="mb-2 flex items-center justify-between text-[10px] text-ink-muted">
          <span>Sessions</span>
          <span>by satisfaction</span>
        </div>
        <div className="space-y-1.5">
          <ProgressRow label="Keynote" value={94} />
          <ProgressRow label="Workshops" value={88} />
          <ProgressRow label="Networking" value={81} />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'success' | 'warm' | 'cool';
}) {
  const t =
    tone === 'brand'
      ? 'from-brand-500/30 to-brand-700/10'
      : tone === 'success'
        ? 'from-[#00C896]/30 to-[#00A074]/10'
        : tone === 'warm'
          ? 'from-[#FF7675]/25 to-[#FF5757]/5'
          : 'from-[#5B8DEF]/30 to-[#3F69D1]/10';
  return (
    <div className={`rounded-lg border border-surface-border bg-gradient-to-br ${t} p-3`}>
      <div className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="mt-1 text-base font-semibold text-ink-primary">{value}</div>
    </div>
  );
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-[10px] text-ink-secondary">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-border">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-brand-300"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-9 text-right text-[10px] text-ink-secondary">{value}%</span>
    </div>
  );
}

function ConnectedNodesMock() {
  return (
    <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-3xl border border-surface-border bg-gradient-to-br from-brand-500/15 via-surface/40 to-surface/40 p-8">
      <svg viewBox="0 0 320 320" className="h-full w-full">
        {/* connections */}
        <line x1="160" y1="60" x2="80" y2="160" stroke="url(#g1)" strokeWidth="1.5" />
        <line x1="160" y1="60" x2="240" y2="160" stroke="url(#g1)" strokeWidth="1.5" />
        <line x1="80" y1="160" x2="160" y2="260" stroke="url(#g1)" strokeWidth="1.5" />
        <line x1="240" y1="160" x2="160" y2="260" stroke="url(#g1)" strokeWidth="1.5" />
        <line x1="160" y1="60" x2="160" y2="260" stroke="url(#g1)" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1="80" y1="160" x2="240" y2="160" stroke="url(#g1)" strokeWidth="1.5" strokeDasharray="3 3" />
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6C5CE7" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#00C896" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        {/* nodes */}
        <NodeCircle cx={160} cy={60} fill="#6C5CE7" label="Plan" />
        <NodeCircle cx={80} cy={160} fill="#FF7675" label="Operate" />
        <NodeCircle cx={240} cy={160} fill="#00C896" label="Engage" />
        <NodeCircle cx={160} cy={260} fill="#5B8DEF" label="Measure" />
      </svg>
    </div>
  );
}

function NodeCircle({
  cx,
  cy,
  fill,
  label,
}: {
  cx: number;
  cy: number;
  fill: string;
  label: string;
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="34" fill={fill} fillOpacity="0.2" />
      <circle cx={cx} cy={cy} r="22" fill={fill} fillOpacity="0.6" />
      <circle cx={cx} cy={cy} r="10" fill={fill} />
      <text
        x={cx}
        y={cy + 56}
        textAnchor="middle"
        className="fill-white text-[12px] font-semibold"
      >
        {label}
      </text>
    </g>
  );
}

function AttendeePhoneMock() {
  return (
    <div className="relative mx-auto w-[260px]">
      <div className="pointer-events-none absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-brand-500/30 to-[#00C896]/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-[2.5rem] border-4 border-surface-border bg-surface-deep p-3 shadow-2xl">
        {/* notch */}
        <div className="mx-auto mb-3 h-1 w-16 rounded-full bg-surface-border" />
        <div className="space-y-3 px-1 pb-3">
          <div className="rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-white">
            <div className="text-[10px] opacity-80">YOUR EVENT</div>
            <div className="mt-1 text-base font-semibold">Tech Summit 2026</div>
            <div className="mt-1 text-[10px] opacity-80">Jun 1 to 2 / Lagos</div>
          </div>
          <div className="rounded-xl border border-surface-border bg-surface/60 p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-muted">Up next</div>
            <div className="mt-1 text-xs font-semibold text-ink-primary">Opening keynote</div>
            <div className="text-[10px] text-ink-secondary">10:30 / Main hall</div>
          </div>
          <div className="rounded-xl border border-surface-border bg-surface/60 p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-muted">Your ticket</div>
            <div className="mt-2 flex items-center justify-center rounded-lg bg-surface-deep/60 p-3">
              <QrCode className="h-12 w-12 text-ink-primary" />
            </div>
            <div className="mt-2 text-center text-[10px] text-ink-muted">Scan at entry</div>
          </div>
          <div className="rounded-xl border border-surface-border bg-surface/60 p-3">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00C896]" />
              <span className="text-[10px] font-semibold text-[#00C896]">UPDATE</span>
            </div>
            <div className="mt-1 text-xs text-ink-primary">Doors are now open.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
