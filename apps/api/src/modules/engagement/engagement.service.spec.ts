import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EngagementService } from './engagement.service';

/**
 * resolveTicketParticipant is the credential check that lets an attendee enter
 * the live room with the ticket they hold instead of a login. Only a live ticket
 * (issued or checked_in) admits; anything else is refused, and the resolved
 * identity is the ticket's registrant + event.
 */
function makeService(findUnique: jest.Mock) {
  const prisma = { ticket: { findUnique } };
  return new EngagementService(prisma as never);
}

describe('EngagementService.resolveTicketParticipant', () => {
  const ticket = (status: string) => ({
    status,
    registration: { userId: 'user-1', eventId: 'event-1' },
  });

  it('resolves an issued ticket to its registrant and event', async () => {
    const svc = makeService(jest.fn().mockResolvedValue(ticket('issued')));
    await expect(svc.resolveTicketParticipant('TKT-1')).resolves.toEqual({
      userId: 'user-1',
      eventId: 'event-1',
    });
  });

  it('resolves a checked_in ticket too', async () => {
    const svc = makeService(jest.fn().mockResolvedValue(ticket('checked_in')));
    await expect(svc.resolveTicketParticipant('TKT-1')).resolves.toEqual({
      userId: 'user-1',
      eventId: 'event-1',
    });
  });

  it('trims the code before lookup', async () => {
    const findUnique = jest.fn().mockResolvedValue(ticket('issued'));
    const svc = makeService(findUnique);
    await svc.resolveTicketParticipant('  TKT-1  ');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'TKT-1' } }),
    );
  });

  it.each(['pending', 'cancelled', 'void'])('refuses a %s ticket', async (status) => {
    const svc = makeService(jest.fn().mockResolvedValue(ticket(status)));
    await expect(svc.resolveTicketParticipant('TKT-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('404s an unknown code', async () => {
    const svc = makeService(jest.fn().mockResolvedValue(null));
    await expect(svc.resolveTicketParticipant('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s an empty code without hitting the database', async () => {
    const findUnique = jest.fn();
    const svc = makeService(findUnique);
    await expect(svc.resolveTicketParticipant('   ')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });
});

/**
 * Live spotlight (organizer "on screen now" broadcast). Org-scoped writes,
 * kind-specific validation, and a public read that hides an inactive item.
 */
function makeSpotService(opts: {
  event?: unknown;
  row?: unknown;
}) {
  const prisma = {
    event: { findFirst: jest.fn().mockResolvedValue('event' in opts ? opts.event : { id: 'e1' }) },
    liveSpotlight: {
      findUnique: jest.fn().mockResolvedValue(opts.row ?? null),
      upsert: jest
        .fn()
        .mockImplementation(({ create }: { create: Record<string, unknown> }) => ({
          ...create,
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { svc: new EngagementService(prisma as never), prisma };
}

describe('EngagementService.spotlight', () => {
  it('getSpotlight returns null when none is set', async () => {
    const { svc } = makeSpotService({ row: null });
    await expect(svc.getSpotlight('e1')).resolves.toBeNull();
  });

  it('getSpotlight hides an inactive item', async () => {
    const { svc } = makeSpotService({
      row: { kind: 'announcement', title: 'Hi', body: null, url: null, active: false, updatedAt: new Date() },
    });
    await expect(svc.getSpotlight('e1')).resolves.toBeNull();
  });

  it('getSpotlight returns the active item shaped', async () => {
    const { svc } = makeSpotService({
      row: {
        kind: 'announcement',
        title: 'Doors open',
        body: null,
        url: null,
        active: true,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    await expect(svc.getSpotlight('e1')).resolves.toEqual({
      kind: 'announcement',
      title: 'Doors open',
      body: null,
      url: null,
      active: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('setSpotlight 404s when the event is not in the org', async () => {
    const { svc } = makeSpotService({ event: null });
    await expect(
      svc.setSpotlight('org1', 'e1', { kind: 'announcement', title: 'x' }, 'u1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('setSpotlight rejects a link with no url', async () => {
    const { svc } = makeSpotService({});
    await expect(
      svc.setSpotlight('org1', 'e1', { kind: 'link' }, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setSpotlight rejects an announcement with no title or body', async () => {
    const { svc } = makeSpotService({});
    await expect(
      svc.setSpotlight('org1', 'e1', { kind: 'announcement' }, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setSpotlight rejects a non-url link', async () => {
    const { svc } = makeSpotService({});
    await expect(
      svc.setSpotlight('org1', 'e1', { kind: 'video', url: 'not a url' }, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setSpotlight upserts a valid announcement and returns it shaped', async () => {
    const { svc, prisma } = makeSpotService({});
    const out = await svc.setSpotlight('org1', 'e1', { kind: 'announcement', body: 'Hello' }, 'u1');
    expect(out).toMatchObject({ kind: 'announcement', body: 'Hello', active: true });
    expect(prisma.liveSpotlight.upsert).toHaveBeenCalled();
  });

  it('clearSpotlight deactivates the row', async () => {
    const { svc, prisma } = makeSpotService({});
    await expect(svc.clearSpotlight('org1', 'e1')).resolves.toBeNull();
    expect(prisma.liveSpotlight.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'e1' },
      data: { active: false },
    });
  });
});

/**
 * Chat moderation. Organizer-only, scoped to the event's chat channel, with a
 * soft delete that the public feed already filters out.
 */
function makeChatService(opts: {
  authorized?: boolean;
  messages?: Array<Record<string, unknown>>;
  found?: { channelId: string } | null;
}) {
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    event: { findUnique: jest.fn().mockResolvedValue({ organizationId: 'org1' }) },
    membership: {
      findFirst: jest.fn().mockResolvedValue(opts.authorized === false ? null : { id: 'm1' }),
    },
    channel: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', eventId: 'e1' }) },
    message: {
      findMany: jest.fn().mockResolvedValue(opts.messages ?? []),
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.found === undefined ? { channelId: 'c1' } : opts.found),
      update,
    },
  };
  return { svc: new EngagementService(prisma as never), update };
}

describe('EngagementService.chat moderation', () => {
  it('listChatForOrganizer refuses a non-organizer', async () => {
    const { svc } = makeChatService({ authorized: false });
    await expect(svc.listChatForOrganizer('e1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('listChatForOrganizer returns messages oldest-first with author', async () => {
    const { svc } = makeChatService({
      messages: [
        { id: 'm2', body: 'second', createdAt: new Date('2026-01-01T00:01:00Z'), user: { id: 'u2', fullName: 'Bee' } },
        { id: 'm1', body: 'first', createdAt: new Date('2026-01-01T00:00:00Z'), user: { id: 'u1', fullName: 'Ada' } },
      ],
    });
    const out = await svc.listChatForOrganizer('e1', 'org-user');
    expect(out.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(out[0]).toMatchObject({ body: 'first', authorName: 'Ada', authorId: 'u1' });
  });

  it('deleteChatMessage soft-deletes a message in the event channel', async () => {
    const { svc, update } = makeChatService({ found: { channelId: 'c1' } });
    await expect(svc.deleteChatMessage('e1', 'u1', 'm1')).resolves.toEqual({ id: 'm1' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'm1' } }));
  });

  it('deleteChatMessage 404s a message from a different channel', async () => {
    const { svc, update } = makeChatService({ found: { channelId: 'other' } });
    await expect(svc.deleteChatMessage('e1', 'u1', 'm1')).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('deleteChatMessage 404s an unknown message', async () => {
    const { svc } = makeChatService({ found: null });
    await expect(svc.deleteChatMessage('e1', 'u1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
