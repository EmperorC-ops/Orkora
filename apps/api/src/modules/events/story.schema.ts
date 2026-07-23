import { z } from 'zod';

/**
 * Server-side validation for Story Mode compositions.
 *
 * The web composer owns the rich per-block shapes (packages/contracts). Here we
 * validate the envelope the API is willing to store: known block types, a sane
 * block count, and a boolean hidden flag. Per-block `data` is accepted as an
 * object so the composer can evolve block fields without a server deploy; the
 * renderer reads fields defensively. The one hard business rule (a visible
 * tickets block must exist) is enforced in the service, not here.
 */

export const STORY_BLOCK_TYPES = [
  'hero',
  'editorial',
  'pullQuote',
  'cast',
  'moodboard',
  'playlist',
  'agenda',
  'tickets',
  'faq',
  'brandCollab',
  'location',
] as const;

export const STORY_TEMPLATES = [
  'classic',
  'editorial',
  'cinematic',
  'underground',
  'runway',
] as const;

export const StoryBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(STORY_BLOCK_TYPES),
  variant: z.string().max(24).optional(),
  hidden: z.boolean().default(false),
  data: z.record(z.unknown()).default({}),
});
export type StoryBlockValidated = z.infer<typeof StoryBlockSchema>;

// Soft cap from D2 (warn at 15); hard cap at 40 to bound payload size.
export const StoryCompositionSchema = z.array(StoryBlockSchema).max(40);
export type StoryCompositionValidated = z.infer<typeof StoryCompositionSchema>;

export function hasVisibleTicketsBlock(blocks: StoryBlockValidated[]): boolean {
  return blocks.some((b) => b.type === 'tickets' && !b.hidden);
}
