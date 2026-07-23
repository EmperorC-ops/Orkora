/**
 * Story Mode block types for the public renderer.
 *
 * Mirrors packages/contracts/src/story-blocks.ts. The web app defines its read
 * shapes inline (it does not depend on the contracts package at build time), so
 * these types are kept in sync by hand. If you change a block's data shape in
 * contracts, change it here too.
 */

export interface HeroData {
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  headline: string;
  subheadline: string;
  dateCityLine: string;
  ctaPrimaryText: string;
  ctaSecondaryText: string;
}

export interface EditorialData {
  body: string;
  pullQuote: string | null;
  imageUrl: string | null;
}

export interface PullQuoteData {
  quote: string;
  attribution: string | null;
}

export interface CastPerson {
  name: string;
  role: string | null;
  avatarUrl: string | null;
  social: string | null;
  bio: string | null;
}

export interface CastData {
  variant: 'grid' | 'list';
  columns: 2 | 3 | 4;
  people: CastPerson[];
  useEventSpeakers: boolean;
}

export interface MoodboardData {
  tiles: { url: string; caption: string | null }[];
}

export interface PlaylistData {
  variant: 'embed' | 'tracklist';
  provider: 'spotify' | 'apple' | 'soundcloud' | 'youtube' | null;
  embedUrl: string | null;
  tracks: { title: string; artist: string | null }[];
}

export interface AgendaData {
  heading: string;
}

export interface TicketsData {
  heading: string;
}

export interface FaqData {
  heading: string;
  items: { q: string; a: string }[];
}

export interface BrandCollabData {
  partnerName: string;
  imageUrl: string | null;
  url: string | null;
  text: string;
}

export interface LocationData {
  address: string;
  mapEmbedUrl: string | null;
  approximate: boolean;
}

export type StoryBlock =
  | { id: string; type: 'hero'; variant: 'image' | 'video' | 'minimal'; hidden: boolean; data: HeroData }
  | { id: string; type: 'editorial'; hidden: boolean; data: EditorialData }
  | { id: string; type: 'pullQuote'; hidden: boolean; data: PullQuoteData }
  | { id: string; type: 'cast'; hidden: boolean; data: CastData }
  | { id: string; type: 'moodboard'; hidden: boolean; data: MoodboardData }
  | { id: string; type: 'playlist'; hidden: boolean; data: PlaylistData }
  | { id: string; type: 'agenda'; hidden: boolean; data: AgendaData }
  | { id: string; type: 'tickets'; hidden: boolean; data: TicketsData }
  | { id: string; type: 'faq'; hidden: boolean; data: FaqData }
  | { id: string; type: 'brandCollab'; hidden: boolean; data: BrandCollabData }
  | { id: string; type: 'location'; hidden: boolean; data: LocationData };

/**
 * An event renders through the Story Mode renderer only when it has been
 * published (story_published_at set) and has at least one visible block.
 * Otherwise the classic layout is used, so existing events are untouched.
 */
export function usesStoryMode(event: {
  storyPublishedAt?: string | null;
  storyBlocks?: unknown;
}): boolean {
  if (!event.storyPublishedAt) return false;
  const blocks = event.storyBlocks;
  return Array.isArray(blocks) && blocks.some((b) => b && (b as StoryBlock).hidden !== true);
}
