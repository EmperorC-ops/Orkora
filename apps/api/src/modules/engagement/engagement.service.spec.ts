import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EngagementService } from './engagement.service';

/**
 * Tenancy tests for organizer poll actions. The org-scoped RolesGuard only
 * proves the actor is an organizer of :orgId; it does NOT prove that the
 * sessionId in the body (createPoll) or the pollId in the path (closePoll)
 * belongs to that org. These tests lock the service-layer ownership checks that
 * stop an organizer of one org from creating/closing polls in another org.
 */

function makeService(prisma: unknown) {
  return new EngagementService(prisma as never);
}

describe('EngagementService.createPoll tenancy', () => {
  it('refuses to create a poll on a session that is not in the org/event', async () => {
    const session = { findFirst: jest.fn().mockResolvedValue(null) };
    const poll = { create: jest.fn() };
    const svc = makeService({ session, poll });

    await expect(
      svc.createPoll({
        orgId: 'org-A',
        eventId: 'evt-A',
        sessionId: 'session-from-org-B',
        question: 'Q?',
        options: ['a', 'b'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Ownership is verified scoped to BOTH event and org, and nothing is created.
    expect(session.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'session-from-org-B',
          event: { id: 'evt-A', organizationId: 'org-A' },
        },
      }),
    );
    expect(poll.create).not.toHaveBeenCalled();
  });

  it('creates the poll when the session belongs to the org/event', async () => {
    const session = { findFirst: jest.fn().mockResolvedValue({ id: 'session-A' }) };
    const poll = { create: jest.fn().mockResolvedValue({ id: 'poll-1' }) };
    const svc = makeService({ session, poll });

    const out = await svc.createPoll({
      orgId: 'org-A',
      eventId: 'evt-A',
      sessionId: 'session-A',
      question: 'Q?',
      options: ['a', 'b'],
    });

    expect(out).toEqual({ id: 'poll-1' });
    expect(poll.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sessionId: 'session-A' }) }),
    );
  });
});

describe('EngagementService.closePoll tenancy', () => {
  it('refuses to close a poll whose event is not in the org', async () => {
    const poll = { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() };
    const svc = makeService({ poll });

    await expect(
      svc.closePoll({ orgId: 'org-A', eventId: 'evt-A', pollId: 'poll-from-org-B' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(poll.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'poll-from-org-B',
          session: { event: { id: 'evt-A', organizationId: 'org-A' } },
        },
      }),
    );
    expect(poll.update).not.toHaveBeenCalled();
  });

  it('closes the poll when it belongs to the org/event', async () => {
    const updated = {
      id: 'poll-1',
      question: 'Q?',
      options: [
        { id: '1', label: 'a' },
        { id: '2', label: 'b' },
      ],
      status: 'closed',
      multiSelect: false,
      closedAt: new Date(),
      sessionId: 'session-A',
      votes: [],
      session: { id: 'session-A', title: 'Keynote', eventId: 'evt-A' },
    };
    const poll = {
      findFirst: jest.fn().mockResolvedValue({ id: 'poll-1' }),
      update: jest.fn().mockResolvedValue(updated),
    };
    const svc = makeService({ poll });

    const out = await svc.closePoll({ orgId: 'org-A', eventId: 'evt-A', pollId: 'poll-1' });

    expect(poll.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'poll-1' }, data: expect.objectContaining({ status: 'closed' }) }),
    );
    expect(out).toEqual(expect.objectContaining({ id: 'poll-1', status: 'closed' }));
  });
});

/**
 * The websocket `qa:answer` action bypasses the REST RolesGuard: the socket only
 * authenticates the user. answerQuestion must therefore prove organizer
 * membership in the question's event's org itself, otherwise any authenticated
 * attendee could post organizer-level answers to any event's Q&A by id.
 */
describe('EngagementService.answerQuestion authorization', () => {
  it('refuses to answer when the user is not an organizer of the event org', async () => {
    const prisma = {
      message: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'q1', channelId: 'c1', channel: { eventId: 'evt-B' } }),
        create: jest.fn(),
      },
      event: { findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-B' }) },
      membership: { findFirst: jest.fn().mockResolvedValue(null) },
      channel: { findUnique: jest.fn() },
    };
    const svc = makeService(prisma);

    await expect(
      svc.answerQuestion({ questionId: 'q1', userId: 'attacker', body: 'fake official answer' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'attacker',
          organizationId: 'org-B',
          role: { in: ['owner', 'admin', 'organizer'] },
        }),
      }),
    );
    // No answer is written.
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('posts the answer when the user is an organizer of the event org', async () => {
    const prisma = {
      message: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'q1', channelId: 'c1', channel: { eventId: 'evt-A' } }),
        create: jest.fn().mockResolvedValue({
          id: 'a1',
          body: 'answer',
          createdAt: new Date(),
          replyToId: 'q1',
          user: { id: 'org-user', fullName: 'Organizer', avatarUrl: null },
        }),
      },
      event: { findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-A' }) },
      membership: { findFirst: jest.fn().mockResolvedValue({ id: 'm1' }) },
      channel: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', eventId: 'evt-A' }) },
    };
    const svc = makeService(prisma);

    const out = await svc.answerQuestion({
      questionId: 'q1',
      userId: 'org-user',
      body: 'answer',
    });

    expect(prisma.message.create).toHaveBeenCalled();
    expect(out).toEqual(expect.objectContaining({ id: 'a1', replyToId: 'q1' }));
  });
});
