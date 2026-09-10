import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';

/**
 * Tenancy test for the authenticated-but-not-org-scoped read GET /v1/events/:id.
 * It must never expose another org's unpublished work, so findById filters to
 * published, non-suspended events in the query itself. Organizers reach their
 * own drafts through the org-scoped getForOrg(orgId, eventId).
 */

function makeService(findFirst: jest.Mock) {
  const prisma = { event: { findFirst } };
  return new EventsService(prisma as never);
}

describe('EventsService.findById tenancy', () => {
  it('scopes the query to published, non-suspended events', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const svc = makeService(findFirst);

    await expect(svc.findById('evt-from-another-org')).rejects.toBeInstanceOf(NotFoundException);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'evt-from-another-org',
          status: { notIn: ['draft', 'archived'] },
          organization: { status: { not: 'suspended' } },
        }),
      }),
    );
  });

  it('404s when no published event matches the id', async () => {
    const svc = makeService(jest.fn().mockResolvedValue(null));
    await expect(svc.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

/**
 * Story Mode composition validation.
 *
 * Regression cover for the production incident where the composer autosaved in
 * a loop, every PATCH returned 400 "Invalid story composition", and the payload
 * carried no indication of which block was malformed. The API must now name the
 * offending block index and field.
 */

interface StoryErrorBody {
  message: string;
  errors?: { blockIndex: number | null; field: string | null; code: string; detail: string }[];
}

function makeStoryService(event: Record<string, unknown> = {}) {
  const existing = {
    id: 'evt_1',
    organizationId: 'org_1',
    storyTemplate: 'classic',
    storyBlocks: [],
    ...event,
  };
  const findFirst = jest.fn().mockResolvedValue(existing);
  const update = jest.fn().mockResolvedValue(existing);
  const prisma = { event: { findFirst, update } };
  return { svc: new EventsService(prisma as never), findFirst, update };
}

async function captureError(promise: Promise<unknown>): Promise<BadRequestException> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BadRequestException);
  return err as BadRequestException;
}

const ticketsBlock = { id: 'blk_tickets', type: 'tickets', hidden: false, data: {} };

describe('EventsService.updateStory validation feedback', () => {
  it('names the block index and field when a block carries a null variant', async () => {
    const { svc } = makeStoryService();
    const blocks = [
      ticketsBlock,
      { id: 'blk_mood', type: 'moodboard', hidden: false, variant: null, data: { tiles: [] } },
    ];

    const err = await captureError(svc.updateStory('org_1', 'evt_1', { blocks } as never));
    const body = err.getResponse() as StoryErrorBody;

    expect(body.message).toBe('Invalid story composition');
    expect(body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ blockIndex: 1, field: 'variant' })]),
    );
  });

  it('names the block index and field when hidden is null instead of absent', async () => {
    const { svc } = makeStoryService();
    const blocks = [ticketsBlock, { id: 'blk_hero', type: 'hero', hidden: null, data: {} }];

    const err = await captureError(svc.updateStory('org_1', 'evt_1', { blocks } as never));
    const body = err.getResponse() as StoryErrorBody;

    expect(body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ blockIndex: 1, field: 'hidden' })]),
    );
  });

  it('names the block index when data is null instead of an object', async () => {
    const { svc } = makeStoryService();
    const blocks = [ticketsBlock, { id: 'blk_faq', type: 'faq', hidden: false, data: null }];

    const err = await captureError(svc.updateStory('org_1', 'evt_1', { blocks } as never));
    const body = err.getResponse() as StoryErrorBody;

    expect(body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ blockIndex: 1, field: 'data' })]),
    );
  });

  it('flags an unknown block type against its index', async () => {
    const { svc } = makeStoryService();
    const blocks = [ticketsBlock, { id: 'blk_x', type: 'carousel', hidden: false, data: {} }];

    const err = await captureError(svc.updateStory('org_1', 'evt_1', { blocks } as never));
    const body = err.getResponse() as StoryErrorBody;

    expect(body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ blockIndex: 1, field: 'type' })]),
    );
  });

  it('caps the issue list so a pathological payload cannot inflate the response', async () => {
    const { svc } = makeStoryService();
    const blocks = Array.from({ length: 39 }, (_, i) => ({
      id: `blk_${i}`,
      type: 'editorial',
      hidden: null,
      data: {},
    }));

    const err = await captureError(
      svc.updateStory('org_1', 'evt_1', { blocks: [ticketsBlock, ...blocks] } as never),
    );
    const body = err.getResponse() as StoryErrorBody;

    expect(body.errors!.length).toBeLessThanOrEqual(20);
  });

  it('still rejects a well-formed composition with no visible tickets block', async () => {
    const { svc, update } = makeStoryService();
    const blocks = [{ id: 'blk_hero', type: 'hero', hidden: false, data: {} }];

    const err = await captureError(svc.updateStory('org_1', 'evt_1', { blocks } as never));

    expect(err.getResponse()).toEqual(
      expect.objectContaining({ message: 'Every event page needs a way to buy tickets.' }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a hidden tickets block, because a hidden block is not a way to buy', async () => {
    const { svc } = makeStoryService();
    const blocks = [{ id: 'blk_tickets', type: 'tickets', hidden: true, data: {} }];

    const err = await captureError(svc.updateStory('org_1', 'evt_1', { blocks } as never));

    expect(err.getResponse()).toEqual(
      expect.objectContaining({ message: 'Every event page needs a way to buy tickets.' }),
    );
  });
});

describe('EventsService.publishStory failure modes', () => {
  it('distinguishes a malformed saved composition from a missing tickets block', async () => {
    const { svc } = makeStoryService({
      storyBlocks: [{ id: 'blk_tickets', type: 'tickets', hidden: null, data: {} }],
    });

    const err = await captureError(svc.publishStory('org_1', 'evt_1'));
    const body = err.getResponse() as StoryErrorBody;

    expect(body.message).toBe('The saved story composition is malformed and cannot be published.');
    expect(body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ blockIndex: 0, field: 'hidden' })]),
    );
  });

  it('keeps the plain tickets message when the composition is valid but has no visible tickets', async () => {
    const { svc } = makeStoryService({
      storyBlocks: [{ id: 'blk_hero', type: 'hero', hidden: false, data: {} }],
    });

    const err = await captureError(svc.publishStory('org_1', 'evt_1'));

    expect(err.getResponse()).toEqual(
      expect.objectContaining({ message: 'Compose a story with a tickets block before publishing.' }),
    );
    expect(err.getResponse()).not.toHaveProperty('errors');
  });
});
