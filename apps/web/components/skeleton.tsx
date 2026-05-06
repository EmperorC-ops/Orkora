import { cn } from '@/lib/utils';

/**
 * Tiny skeleton primitive. Renders a brand-tinted block with a subtle
 * shimmer. Compose into specific shapes per page rather than building
 * page-specific skeletons.
 *
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-12 w-12 rounded-full" />
 *
 * The keyframes are inline rather than in globals.css so the component is
 * fully self-contained.
 */
export function Skeleton({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gradient-to-r from-surface-border via-surface-border/60 to-surface-border',
        className,
      )}
      aria-hidden
      {...rest}
    />
  );
}

interface EmptyStateProps {
  title: string;
  body?: string;
  Icon?: React.ComponentType<{ className?: string }>;
  cta?: { href: string; label: string } | { onClick: () => void; label: string };
}

/**
 * Branded empty state. Use anywhere a list returns nothing.
 */
export function EmptyState({ title, body, Icon, cta }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-surface-border bg-surface/40 p-10 text-center">
      {Icon ? (
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <p className="mt-5 text-base font-semibold text-ink-primary">{title}</p>
      {body ? <p className="mt-2 text-sm text-ink-secondary">{body}</p> : null}
      {cta ? (
        'href' in cta ? (
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a
            href={cta.href}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
          >
            {cta.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={cta.onClick}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
          >
            {cta.label}
          </button>
        )
      ) : null}
    </div>
  );
}
