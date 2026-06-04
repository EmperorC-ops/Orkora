import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';
import { Brand } from '@/components/brand';

export default function NotFound() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-surface-deep text-ink-primary">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[480px] w-[920px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-[#FF7675]/10 blur-3xl" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center" aria-label="Orkora home">
          <Brand variant="lockup" width={560} priority className="h-36 w-auto" />
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-surface-border bg-surface/40 text-brand-300">
          <Compass className="h-6 w-6" />
        </span>
        <p className="mt-8 text-sm uppercase tracking-[0.2em] text-brand-300">404</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Off the agenda.
        </h1>
        <p className="mt-4 max-w-md text-base text-ink-secondary">
          That page does not exist, or it moved while you were on the way. Head back home and we
          will pick the next thing together.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-7 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
          >
            <ArrowLeft className="h-4 w-4" /> Back home
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-surface-border bg-surface/40 px-7 py-3 text-sm font-semibold text-ink-primary transition hover:bg-white/5"
          >
            Open dashboard
          </Link>
        </