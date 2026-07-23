import Link from 'next/link';
import StoryTicketsBar from './StoryTicketsBar';
import StoryAnalytics from './StoryAnalytics';
import { BlockView, type StoryEvent } from './StoryBlocks';

/**
 * Story Mode public renderer. Reads an event's composed block sequence and
 * renders block by block (via the shared BlockView). Server-rendered for SEO.
 * The floating tickets bar is the only client island.
 */

export type { StoryEvent };

export default function StoryRenderer({ event }: { event: StoryEvent }) {
  const color = event.organization.brandColor || '#6C5CE7';
  const blocks = (event.storyBlocks ?? []).filter((b) => b && b.hidden !== true);
  const registerHref = `/e/${event.code}/register`;

  return (
    <main className="min-h-screen bg-surface-deep text-ink-primary">
      {/* Slim brand bar */}
      <header className="sticky top-0 z-20 border-b border-surface-border bg-surface-deep/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-6">
          {event.organization.slug ? (
            <Link href={`/o/${event.organization.slug}`} className="text-sm font-semibold tracking-tight">
              {event.organization.name}
            </Link>
          ) : (
            <span className="text-sm font-semibold tracking-tight">{event.organization.name}</span>
          )}
          <Link
            href={registerHref}
            className="ml-auto rounded-full px-4 py-1.5 text-xs font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            Register
          </Link>
        </div>
      </header>

      {blocks.map((block, i) => (
        <div key={block.id} data-story-block data-block-type={block.type} data-block-index={i}>
          <BlockView block={block} event={event} color={color} registerHref={registerHref} />
        </div>
      ))}

      <footer className="border-t border-surface-border bg-surface/40 py-8 text-center text-xs text-ink-muted">
        Powered by{' '}
        <Link href="/" className="font-semibold text-brand-300 hover:text-brand-200">
          Orkora
        </Link>
      </footer>

      <StoryTicketsBar color={color} />
      <StoryAnalytics code={event.code} />
    </main>
  );
}
