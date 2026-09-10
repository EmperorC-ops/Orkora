import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  ReorderTicketTiersDto,
  StoryAnalyticsBatchDto,
  UpdateStoryDto,
} from './event.dto';
import { StoryCompositionSchema } from '../story.schema';

/**
 * Guards the transport layer for DTOs that carry arrays of objects.
 *
 * The global ValidationPipe in main.ts runs with
 * `transformOptions.enableImplicitConversion: true`. Under that setting,
 * class-transformer takes a property whose reflected `design:type` is `Array`
 * and, absent an explicit item type, applies `Array` to each ITEM as well. Every
 * object in the array is silently coerced into `[]`.
 *
 * That is what broke Story Mode in production: every save arrived at the service
 * as `[[]]`, failed the zod composition schema, and returned 400 "Invalid story
 * composition" forever, while an empty composition passed straight through. The
 * payload on the wire was always valid. The DTO destroyed it.
 *
 * `@Type(() => Object)` names the item type and stops the coercion. These tests
 * exist so nobody removes it, and so the same defect is caught if it is ever
 * introduced on another array-of-objects DTO.
 */

const IMPLICIT = { enableImplicitConversion: true };

describe('UpdateStoryDto transport integrity', () => {
  const blocks = [
    { id: 'blk_3ac6052db32c', type: 'hero', hidden: false, variant: 'image', data: { headline: '' } },
    { id: 'blk_f6d5d54691c9', type: 'tickets', hidden: false, data: { heading: 'Tickets' } },
  ];

  it('preserves block objects through implicit conversion', () => {
    const dto = plainToInstance(UpdateStoryDto, { template: 'cinematic', blocks }, IMPLICIT);
    expect(dto.blocks).toEqual(blocks);
  });

  it('never coerces a block into an empty array', () => {
    const dto = plainToInstance(UpdateStoryDto, { blocks }, IMPLICIT);
    dto.blocks.forEach((b) => expect(Array.isArray(b)).toBe(false));
  });

  it('produces a payload the composition schema still accepts', () => {
    const dto = plainToInstance(UpdateStoryDto, { template: 'cinematic', blocks }, IMPLICIT);
    const parsed = StoryCompositionSchema.safeParse(dto.blocks);
    expect(parsed.success).toBe(true);
  });

  it('leaves an empty composition alone', () => {
    const dto = plainToInstance(UpdateStoryDto, { blocks: [] }, IMPLICIT);
    expect(dto.blocks).toEqual([]);
  });

  it('keeps the single-block case intact, which was the minimal repro', () => {
    const one = [{ id: 'blk_f6d5d54691c9', type: 'tickets', hidden: false }];
    const dto = plainToInstance(UpdateStoryDto, { blocks: one }, IMPLICIT);
    expect(dto.blocks).toEqual(one);
    expect(StoryCompositionSchema.safeParse(dto.blocks).success).toBe(true);
  });
});

describe('other array-of-objects DTOs survive implicit conversion', () => {
  it('StoryAnalyticsBatchDto keeps its events', () => {
    const events = [{ kind: 'event_view', blockType: 'hero' }];
    const dto = plainToInstance(StoryAnalyticsBatchDto, { events }, IMPLICIT);
    dto.events.forEach((e) => expect(Array.isArray(e)).toBe(false));
    expect(dto.events[0]?.kind).toBe('event_view');
  });

  it('ReorderTicketTiersDto keeps its items', () => {
    const items = [{ id: 'tier_1', position: 0 }];
    const dto = plainToInstance(ReorderTicketTiersDto, { items }, IMPLICIT);
    dto.items.forEach((i) => expect(Array.isArray(i)).toBe(false));
    expect(dto.items[0]?.id).toBe('tier_1');
  });
});
