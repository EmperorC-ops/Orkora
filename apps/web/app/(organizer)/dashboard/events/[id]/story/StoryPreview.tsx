'use client';

import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { BlockView, type StoryEvent } from '@/app/(public)/e/[code]/StoryBlocks';

/**
 * Live composer preview. Renders the current (unsaved) in-memory block sequence
 * with the exact same BlockView used by the public page, inside a scrollable
 * frame with a desktop/mobile toggle. Because it reuses the shared block views,
 * what the organiser sees here is what an attendee gets.
 */
export default function StoryPreview({ event }: { event: StoryEvent }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const color = event.organization.brandColor || '#6C5CE7';
  const registerHref = `/e/${event.code}/register`;
  const blocks = (event.storyBlocks ?? []).filter((b) => b && b.hidden !== true);

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => setDevice('desktop')}
          aria-label="Desktop preview"
          className={`rounded-md p-1.5 transition ${device === 'desktop' ? 'bg-brand-500/20 text-brand-200' : 'text-ink-muted hover:text-ink-primary'}`}
        >
          <Monitor className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setDevice('mobile')}
          aria-label="Mobile preview"
          className={`rounded-md p-1.5 transition ${device === 'mobile' ? 'bg-brand-500/20 text-brand-200' : 'text-ink-muted hover:text-ink-primary'}`}
        >
          <Smartphone className="h-4 w-4" />
        </button>
      </div>

      <div className={device === 'mobile' ? 'mx-auto w-[390px] max-w-full' : 'w-full'}>
        <div className="max-h-[72vh] overflow-y-auto rounded-2xl border border-surface-border bg-surface-deep">
          {blocks.length === 0 ? (
            <div className="p-16 text-center text-sm text-ink-muted">
              Nothing to preview yet. Add or unhide a block.
            </div>
          ) : (
            blocks.map((block) => (
              <BlockView key={block.id} block={block} event={event} color={color} registerHref={registerHref} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
