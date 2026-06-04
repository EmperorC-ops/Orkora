import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Apple,
  Smartphone,
  Monitor,
  Share,
  Plus,
  Globe2,
  Download,
} from 'lucide-react';
import InstallPrompt from '../_components/InstallPrompt';
import { Brand } from '@/components/brand';

export const metadata = { title: 'Install Orkora' };

/**
 * Public "how to install Orkora on your device" page.
 *
 * Reachable directly (/install), linked from the event page, and surfaced by
 * the in-page InstallPrompt component when a user dismisses the banner.
 * Covers the three real install paths:
 *
 *   - iOS Safari: Share -> Add to Home Screen
 *   - Android Chrome / Edge / Brave: install prompt (or browser menu)
 *   - Desktop Chrome / Edge / Brave: install icon in the address bar
 *
 * The native Android APK (built via EAS) is intentionally not the first thing
 * users see. The PWA path is faster and works on every device. The APK link
 * is offered as a secondary path for organizers who want the polished native
 * experience or who need to work offline (the EAS build adds expo-secure-store
 * and offline ticket caching).
 */
export default function InstallPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-surface-deep text-ink-primary">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[480px] w-[920px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
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

      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-8 pt-12 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-ink-secondary backdrop-blur">
          <Smartphone className="h-3 w-3 text-brand-300" />
          Works on every phone, tablet, and computer
        </span>
        <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          Install Orkora in 10 seconds.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-ink-secondary">
          Orkora installs straight from your browser. No App Store, no Play Store, no waiting. Once installed it opens like a native app, with its own home-screen icon, full-screen layout, and offline-friendly ticket access.
        </p>
        <InstallPrompt variant="inline" />
      </section>

      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-16">
        <div className="space-y-4">
          <Platform
            Icon={Apple}
            title="iPhone or iPad"
            steps={[
              <>
                Open this page in <strong className="text-ink-primary">Safari</strong> (not Chrome on iOS).
              </>,
              <>
                Tap the{' '}
                <span className="inline-flex items-center gap-1">
                  <Share className="inline-block h-4 w-4 align-text-bottom text-brand-300" />{' '}
                  <strong className="text-ink-primary">Share</strong>
                </span>{' '}
                icon at the bottom of the screen.
              </>,
              <>
                Scroll down and choose{' '}
                <span className="inline-flex items-center gap-1">
                  <Plus className="inline-block h-4 w-4 align-text-bottom text-brand-300" />{' '}
                  <strong className="text-ink-primary">Add to Home Screen</strong>
                </span>
                .
              </>,
              <>Tap <strong className="text-ink-primary">Add</strong> in the top right. Orkora now lives on your home screen.</>,
            ]}
          />

          <Platform
            Icon={Smartphone}
            title="Android phone or tablet"
            steps={[
              <>
                Open this page in <strong className="text-ink-primary">Chrome</strong>, Edge, or Brave.
              </>,
              <>If a banner shows at the bottom saying <strong className="text-ink-primary">Install Orkora</strong>, tap it and you are done.</>,
              <>
                If not, open the browser&apos;s menu (three dots, top right) and choose{' '}
                <strong className="text-ink-primary">Install app</strong> or{' '}
                <strong className="text-ink-primary">Add to Home Screen</strong>.
              </>,
              <>Confirm. Orkora installs and opens like any other app.</>,
            ]}
          />

          <Platform
            Icon={Monitor}
            title="Mac, Windows, or Linux"
            steps={[
              <>
                Open this page in <strong className="text-ink-primary">Chrome</strong>, Edge, Brave, or Arc.
              </>,
              <>
                In the address bar, look for the{' '}
                <Download className="inline-block h-4 w-4 align-text-bottom text-brand-300" />{' '}
                install icon, or open the browser menu and choose{' '}
                <strong className="text-ink-primary">Install Orkora</strong>.
              </>,
              <>Confirm. Orkora opens in its own window with a dock / taskbar icon.</>,
              <>Safari on Mac does not currently support installing web apps. Use Chrome, Edge, or Brave.</>,
            ]}
          />
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-24">
        <div className="rounded-3xl border border-surface-border bg-surface/40 p-8 sm:p-10">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-secondary">
            Want the native Android app instead?
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            The native Orkora app for Android is in internal preview.
          </h2>
          <p className="mt-3 text-sm text-ink-secondary">
            The PWA above is the recommended install for everyone. The native Android build adds a couple of niceties (secure on-device ticket storage via expo-secure-store, push notifications, offline ticket QR even without a network connection). It is currently distributed by direct link to a small group of beta organizers.
          </p>
          <p className="mt-3 text-sm text-ink-secondary">
            Want the APK? Email{' '}
            <a href="mailto:hello@orkora.events" className="text-brand-300 hover:text-brand-200">
              hello@orkora.events
            </a>{' '}
            from the address on your Orkora account. We will send you a signed
            link.
          </p>
          <p className="mt-6 text-xs text-ink-muted">
            iOS native app: in preparation. The PWA above gives you the same Orkora experience on iPhone and iPad today.
          </p>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-8 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
          >
            Take me to Orkora <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-3 text-sm text-ink-secondary">
            Or open any event link on your phone and the install prompt finds you.
          </p>
        </div>
      </section>
    </main>
  );
}

function Platform({
  Icon,
  title,
  steps,
}: {
  Icon: typeof Apple;
  title: string;
  steps: React.ReactNode[];
}) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface/40 p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-ink-primary">
          {title}
        </h2>
      </div>
      <ol className="mt-5 space-y-3 text-sm leading-relaxed text-ink-secondary">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-500/15 text-xs font-semibold text-brand-300">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
