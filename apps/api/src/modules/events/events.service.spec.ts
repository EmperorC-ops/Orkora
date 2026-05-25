import { NotFoundException } from '@nestjs/common';
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
