import { z } from 'zod';

/**
 * Story Mode block contracts.
 *
 * An event's page is a sequence of typed blocks (`events.story_blocks` JSONB).
 * The organiser composes from these; the four templates just seed an initial
 * sequence. Both the API (validating a PATCH) and the clients (rendering,
 * editing) import these shapes so a change here breaks every consumer at
 * compile time.
 *
 * R1 scope: preset blocks only. No custom HTML/code blocks, no arbitrary
 * embeds. See DESIGN/D2_story_mode.md.
 */

// ===== Block type + template enums =====

export const StoryBlockType = z.enum([
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
]);
export type StoryBlockType = z.infer<typeof StoryBlockType>;

export const StoryTemplate = z.enum([
  'classic',
  'editorial',
  'cinematic',
  'underground',
  'runway',
]);
export type StoryTemplate = z.infer<typeof StoryTemplate>;

// ===== Per-block data schemas =====

export const HeroBlockData = z.object({
  mediaUrl: z.string().nullable().default(null),
  mediaType: z.enum(['image', 'video']).nullable().default(null),
  headline: z.string().default(''),
  subheadline: z.string().default(''),
  dateCityLine: z.string().default(''),
  ctaPrimaryText: z.string().default('Get tickets'),
  ctaSecondaryText: z.string().default('Add to calendar'),
});
export type HeroBlockData = z.infer<typeof HeroBlockData>;

export const EditorialBlockData = z.object({
  body: z.string().default(''),
  pullQuote: z.string().nullable().default(null),
  imageUrl: z.string().nullable().default(null),
});
export type EditorialBlockData = z.infer<typeof EditorialBlockData>;

export const PullQuoteBlockData = z.object({
  quote: z.string().default(''),
  attribution: z.string().nullable().default(null),
});
export type PullQuoteBlockData = z.infer<typeof PullQuoteBlockData>;

export const CastPerson = z.object({
  name: z.string(),
  role: z.string().nullable().default(null),
  avatarUrl: z.string().nullable().default(null),
  social: z.string().nullable().default(null),
  bio: z.string().nullable().default(null),
});
export type CastPerson = z.infer<typeof CastPerson>;

export const CastBlockData = z.object({
  variant: z.enum(['grid', 'list']).default('grid'),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  people: z.array(CastPerson).default([]),
  // When true and people is empty, the renderer falls back to event.speakers.
  useEventSpeakers: z.boolean().default(false),
});
export type CastBlockData = z.infer<typeof CastBlockData>;

export const MoodboardTile = z.object({
  url: z.string(),
  caption: z.string().nullable().default(null),
});
export type MoodboardTile = z.infer<typeof MoodboardTile>;

export const MoodboardBlockData = z.object({
  tiles: z.array(MoodboardTile).default([]),
});
export type MoodboardBlockData = z.infer<typeof MoodboardBlockData>;

export const PlaylistTrack = z.object({
  title: z.string(),
  artist: z.string().nullable().default(null),
});
export type PlaylistTrack = z.infer<typeof PlaylistTrack>;

export const PlaylistBlockData = z.object({
  variant: z.enum(['embed', 'tracklist']).default('embed'),
  provider: z.enum(['spotify', 'apple', 'soundcloud', 'youtube']).nullable().default(null),
  embedUrl: z.string().nullable().default(null),
  tracks: z.array(PlaylistTrack).default([]),
});
export type PlaylistBlockData = z.infer<typeof PlaylistBlockData>;

// Agenda + Tickets render from the event's own data; no per-block content.
export const AgendaBlockData = z.object({ heading: z.string().default('Agenda') });
export type AgendaBlockData = z.infer<typeof AgendaBlockData>;

export const TicketsBlockData = z.object({ heading: z.string().default('Tickets') });
export type TicketsBlockData = z.infer<typeof TicketsBlockData>;

export const FaqItem = z.object({ q: z.string(), a: z.string() });
export type FaqItem = z.infer<typeof FaqItem>;

export const FaqBlockData = z.object({
  heading: z.string().default('Questions'),
  items: z.array(FaqItem).default([]),
});
export type FaqBlockData = z.infer<typeof FaqBlockData>;

export const BrandCollabBlockData = z.object({
  partnerName: z.string().default(''),
  imageUrl: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  text: z.string().default(''),
});
export type BrandCollabBlockData = z.infer<typeof BrandCollabBlockData>;

export const LocationBlockData = z.object({
  address: z.string().default(''),
  mapEmbedUrl: z.string().nullable().default(null),
  approximate: z.boolean().default(false),
});
export type LocationBlockData = z.infer<typeof LocationBlockData>;

// ===== Block union =====

const blockBase = { id: z.string(), hidden: z.boolean().default(false) };

export const StoryBlock = z.discriminatedUnion('type', [
  z.object({ ...blockBase, type: z.literal('hero'), variant: z.enum(['image', 'video', 'minimal']).default('image'), data: HeroBlockData }),
  z.object({ ...blockBase, type: z.literal('editorial'), data: EditorialBlockData }),
  z.object({ ...blockBase, type: z.literal('pullQuote'), data: PullQuoteBlockData }),
  z.object({ ...blockBase, type: z.literal('cast'), data: CastBlockData }),
  z.object({ ...blockBase, type: z.literal('moodboard'), data: MoodboardBlockData }),
  z.object({ ...blockBase, type: z.literal('playlist'), data: PlaylistBlockData }),
  z.object({ ...blockBase, type: z.literal('agenda'), data: AgendaBlockData }),
  z.object({ ...blockBase, type: z.literal('tickets'), data: TicketsBlockData }),
  z.object({ ...blockBase, type: z.literal('faq'), data: FaqBlockData }),
  z.object({ ...blockBase, type: z.literal('brandCollab'), data: BrandCollabBlockData }),
  z.object({ ...blockBase, type: z.literal('location'), data: LocationBlockData }),
]);
export type StoryBlock = z.infer<typeof StoryBlock>;

export const StoryComposition = z.array(StoryBlock);
export type StoryComposition = z.infer<typeof StoryComposition>;

// The organizer write shape for PATCH .../story.
export const UpdateStoryInput = z.object({
  template: StoryTemplate.optional(),
  blocks: StoryComposition,
});
export type UpdateStoryInput = z.infer<typeof UpdateStoryInput>;

// ===== Seed + compose helpers =====

/** Stable-enough block id. crypto.randomUUID exists in Node 18+ and browsers. */
export function newBlockId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const uuid = g.crypto?.randomUUID
    ? g.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `blk_${uuid.replace(/-/g, '').slice(0, 12)}`;
}

function block<T extends StoryBlockType>(
  type: T,
  data: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): StoryBlock {
  return StoryBlock.parse({ id: newBlockId(), type, hidden: false, data, ...extra });
}

/**
 * The starting block sequence for each template. Data is left at defaults; the
 * organiser fills it in the composer. `tickets` is always present and always
 * last-ish, because every event page needs a way to buy.
 */
export function templateSeed(template: StoryTemplate): StoryBlock[] {
  switch (template) {
    case 'editorial':
      return [
        block('hero', {}, { variant: 'image' }),
        block('pullQuote', {}),
        block('editorial', {}),
        block('cast', { useEventSpeakers: true }),
        block('playlist', {}),
        block('agenda', {}),
        block('tickets', {}),
      ];
    case 'cinematic':
      return [
        block('hero', {}, { variant: 'video' }),
        block('editorial', {}),
        block('moodboard', {}),
        block('cast', { useEventSpeakers: true, columns: 2 }),
        block('playlist', {}),
        block('tickets', {}),
        block('agenda', {}),
        block('faq', {}),
      ];
    case 'underground':
      return [
        block('hero', {}, { variant: 'minimal' }),
        block('editorial', {}),
        block('cast', { variant: 'list', useEventSpeakers: true }),
        block('location', { approximate: true }),
        block('tickets', {}),
      ];
    case 'runway':
      return [
        block('hero', {}, { variant: 'image' }),
        block('cast', { columns: 4, useEventSpeakers: true }),
        block('moodboard', {}),
        block('editorial', {}),
        block('playlist', {}),
        block('tickets', {}),
        block('agenda', {}),
      ];
    case 'classic':
    default:
      return composeClassicSeed();
  }
}

/** The classic layout expressed as blocks, with data left at defaults. */
export function composeClassicSeed(): StoryBlock[] {
  return [
    block('hero', {}, { variant: 'image' }),
    block('editorial', {}),
    block('agenda', {}),
    block('cast', { useEventSpeakers: true }),
    block('tickets', {}),
  ];
}

export interface ClassicComposeInput {
  title: string;
  description?: string | null;
  bannerUrl?: string | null;
  dateCityLine?: string | null;
}

/**
 * Build a classic composition pre-filled from an event's existing fields. Used
 * by the composer as the starting point when an organiser opens Story Mode on
 * an event that has no composition yet, so the first save looks like the page
 * they already had.
 */
export function composeClassic(event: ClassicComposeInput): StoryBlock[] {
  return [
    block(
      'hero',
      {
        mediaUrl: event.bannerUrl ?? null,
        mediaType: event.bannerUrl ? 'image' : null,
        headline: event.title,
        dateCityLine: event.dateCityLine ?? '',
      },
      { variant: event.bannerUrl ? 'image' : 'minimal' },
    ),
    block('editorial', { body: event.description ?? '' }),
    block('agenda', {}),
    block('cast', { useEventSpeakers: true }),
    block('tickets', {}),
  ];
}
