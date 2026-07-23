import { apiFetch } from '@/lib/auth';
import type { StoryBlock } from '@/lib/story';

/**
 * Client-side Story Mode editing helpers: default block factories, template
 * seeds, and the save/publish calls. Mirrors packages/contracts/src/story-blocks.ts.
 */

export const STORY_TEMPLATES = ['classic', 'editorial', 'cinematic', 'underground', 'runway'] as const;
export type StoryTemplate = (typeof STORY_TEMPLATES)[number];

export const TEMPLATE_LABELS: Record<StoryTemplate, string> = {
  classic: 'Classic',
  editorial: 'Editorial',
  cinematic: 'Cinematic',
  underground: 'Underground',
  runway: 'Runway',
};

export const TEMPLATE_BLURBS: Record<StoryTemplate, string> = {
  classic: 'The traditional form-first layout. A safe default.',
  editorial: 'Long-form, magazine-style. For nights where the story matters.',
  cinematic: 'Video-first and image-heavy. For festivals and big productions.',
  underground: 'Text-forward and restrained. For members-only and taste-driven events.',
  runway: 'Image-grid-heavy. For showcases and brand launches.',
};

export type BlockType = StoryBlock['type'];

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: 'Hero',
  editorial: 'Editorial',
  pullQuote: 'Pull quote',
  cast: 'Line-up',
  moodboard: 'Moodboard',
  playlist: 'Playlist',
  agenda: 'Agenda',
  tickets: 'Tickets',
  faq: 'FAQ',
  brandCollab: 'Brand collab',
  location: 'Location',
};

// Block types an organiser can add from the picker. Every type is addable.
export const ADDABLE_BLOCKS: BlockType[] = [
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
];

function id(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const uuid = g.crypto?.randomUUID
    ? g.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `blk_${uuid.replace(/-/g, '').slice(0, 12)}`;
}

export function defaultBlock(type: BlockType, variant?: 'image' | 'video' | 'minimal'): StoryBlock {
  const base = { id: id(), hidden: false };
  switch (type) {
    case 'hero':
      return {
        ...base,
        type: 'hero',
        variant: variant ?? 'image',
        data: {
          mediaUrl: null,
          mediaType: null,
          headline: '',
          subheadline: '',
          dateCityLine: '',
          ctaPrimaryText: 'Get tickets',
          ctaSecondaryText: 'Add to calendar',
        },
      };
    case 'editorial':
      return { ...base, type: 'editorial', data: { body: '', pullQuote: null, imageUrl: null } };
    case 'pullQuote':
      return { ...base, type: 'pullQuote', data: { quote: '', attribution: null } };
    case 'cast':
      return { ...base, type: 'cast', data: { variant: 'grid', columns: 3, people: [], useEventSpeakers: true } };
    case 'moodboard':
      return { ...base, type: 'moodboard', data: { tiles: [] } };
    case 'playlist':
      return { ...base, type: 'playlist', data: { variant: 'embed', provider: null, embedUrl: null, tracks: [] } };
    case 'agenda':
      return { ...base, type: 'agenda', data: { heading: 'Agenda' } };
    case 'tickets':
      return { ...base, type: 'tickets', data: { heading: 'Tickets' } };
    case 'faq':
      return { ...base, type: 'faq', data: { heading: 'Questions', items: [] } };
    case 'brandCollab':
      return { ...base, type: 'brandCollab', data: { partnerName: '', imageUrl: null, url: null, text: '' } };
    case 'location':
      return { ...base, type: 'location', data: { address: '', mapEmbedUrl: null, approximate: false } };
    default:
      return { ...base, type: 'editorial', data: { body: '', pullQuote: null, imageUrl: null } };
  }
}

export function templateSeed(template: StoryTemplate): StoryBlock[] {
  switch (template) {
    case 'editorial':
      return [
        defaultBlock('hero', 'image'),
        defaultBlock('pullQuote'),
        defaultBlock('editorial'),
        defaultBlock('cast'),
        defaultBlock('playlist'),
        defaultBlock('agenda'),
        defaultBlock('tickets'),
      ];
    case 'cinematic':
      return [
        defaultBlock('hero', 'video'),
        defaultBlock('editorial'),
        defaultBlock('moodboard'),
        castWith(defaultBlock('cast'), 2),
        defaultBlock('playlist'),
        defaultBlock('tickets'),
        defaultBlock('agenda'),
        defaultBlock('faq'),
      ];
    case 'underground':
      return [
        defaultBlock('hero', 'minimal'),
        defaultBlock('editorial'),
        castAsList(defaultBlock('cast')),
        approxLocation(defaultBlock('location')),
        defaultBlock('tickets'),
      ];
    case 'runway':
      return [
        defaultBlock('hero', 'image'),
        castWith(defaultBlock('cast'), 4),
        defaultBlock('moodboard'),
        defaultBlock('editorial'),
        defaultBlock('playlist'),
        defaultBlock('tickets'),
        defaultBlock('agenda'),
      ];
    case 'classic':
    default:
      return [
        defaultBlock('hero', 'image'),
        defaultBlock('editorial'),
        defaultBlock('agenda'),
        defaultBlock('cast'),
        defaultBlock('tickets'),
      ];
  }
}

function castWith(b: StoryBlock, columns: 2 | 3 | 4): StoryBlock {
  if (b.type !== 'cast') return b;
  return { ...b, data: { ...b.data, columns } };
}
function castAsList(b: StoryBlock): StoryBlock {
  if (b.type !== 'cast') return b;
  return { ...b, data: { ...b.data, variant: 'list' } };
}
function approxLocation(b: StoryBlock): StoryBlock {
  if (b.type !== 'location') return b;
  return { ...b, data: { ...b.data, approximate: true } };
}

export function composeClassicFrom(event: {
  title: string;
  description?: string | null;
  bannerUrl?: string | null;
}): StoryBlock[] {
  const hero = defaultBlock('hero', event.bannerUrl ? 'image' : 'minimal');
  const editorial = defaultBlock('editorial');
  return [
    hero.type === 'hero'
      ? {
          ...hero,
          data: {
            ...hero.data,
            mediaUrl: event.bannerUrl ?? null,
            mediaType: event.bannerUrl ? 'image' : null,
            headline: event.title,
          },
        }
      : hero,
    editorial.type === 'editorial'
      ? { ...editorial, data: { ...editorial.data, body: event.description ?? '' } }
      : editorial,
    defaultBlock('agenda'),
    defaultBlock('cast'),
    defaultBlock('tickets'),
  ];
}

// ===== API calls =====

export async function saveStory(
  orgId: string,
  eventId: string,
  blocks: StoryBlock[],
  template: StoryTemplate,
): Promise<void> {
  await apiFetch(`/v1/organizations/${orgId}/events/${eventId}/story`, {
    method: 'PATCH',
    json: { template, blocks },
  });
}

export async function publishStory(orgId: string, eventId: string): Promise<void> {
  await apiFetch(`/v1/organizations/${orgId}/events/${eventId}/story/publish`, { method: 'POST' });
}

export async function unpublishStory(orgId: string, eventId: string): Promise<void> {
  await apiFetch(`/v1/organizations/${orgId}/events/${eventId}/story/unpublish`, { method: 'POST' });
}
