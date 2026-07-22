import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';

/**
 * Unit tests for FeedbackService. Prisma is a hand-rolled mock so we can drive
 * the submit guards and, more importantly, verify the summary aggregate math
 * (average rating, NPS score, promoter/passive/detractor buckets, per-session
 * rollups, comment stream).
 */

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    event: { findUnique: jest.fn(), findFirst: jest.fn() },
    session: { findFirst: jest.fn(), findMany: jest.fn() },
    user: { findFirst: jest.fn() },
    eventFeedback: { create: jest.fn(), findMany: jest.fn() },
    ...over,
  } as never;
}

describe('FeedbackService.submitPublic', () => {
  it('rejects a submission with no rating, nps, or comment', async () => {
    const svc = new FeedbackService(makePrisma());
    await expect(svc.submitPublic('ABC123', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('treats a whitespace-only comment as no signal', async () => {
    const svc = new FeedbackService(makePrisma());
    await expect(
      svc.submitPublic('ABC123', { comment: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s when the event is a draft', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue({
      id: 'e1',
      organizationId: 'o1',
      status: 'draft',
      organization: { status: 'active' },
    });
    const svc = new FeedbackService(prisma);
    await expect(
      svc.submitPublic('ABC123', { rating: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the organization is suspended', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue({
      id: 'e1',
      organizationId: 'o1',
      status: 'live',
      organization: { status: 'suspended' },
    });
    const svc = new FeedbackService(prisma);
    await expect(
      svc.submitPublic('ABC123', { rating: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a sessionId that is not part of the event', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue({
      id: 'e1',
      organizationId: 'o1',
      status: 'ended',
      organization: { status: 'active' },
    });
    (prisma as any).session.findFirst.mockResolvedValue(null);
    const svc = new FeedbackService(prisma);
    await expect(
      svc.submitPublic('ABC123', { rating: 4, sessionId: 'sX' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists a valid submission with the event org id and links the user by email', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue({
      id: 'e1',
      organizationId: 'o1',
      status: 'ended',
      organization: { status: 'active' },
    });
    (prisma as any).user.findFirst.mockResolvedValue({ id: 'u9' });
    (prisma as any).eventFeedback.create.mockResolvedValue({ id: 'f1' });
    const svc = new FeedbackService(prisma);

    const out = await svc.submitPublic('abc123', {
      rating: 4,
      npsScore: 9,
      comment: '  great  ',
      email: 'Attendee@Example.com',
    });

    expect(out).toEqual({ status: 'received' });
    const arg = (prisma as any).eventFeedback.create.mock.calls[0][0].data;
    expect(arg.organizationId).toBe('o1');
    expect(arg.eventId).toBe('e1');
    expect(arg.userId).toBe('u9');
    expect(arg.attendeeEmail).toBe('attendee@example.com');
    expect(arg.comment).toBe('great'); // trimmed
    expect(arg.rating).toBe(4);
    expect(arg.npsScore).toBe(9);
  });
});

describe('FeedbackService.getEventSummary', () => {
  it('404s when the event does not belong to the org', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findFirst.mockResolvedValue(null);
    const svc = new FeedbackService(prisma);
    await expect(svc.getEventSummary('o1', 'e1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('computes averages, NPS, buckets, per-session rollups, and comments', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findFirst.mockResolvedValue({ id: 'e1' });
    (prisma as any).session.findMany.mockResolvedValue([
      { id: 's1', title: 'Keynote' },
      { id: 's2', title: 'Workshop' },
    ]);
    const now = new Date('2026-07-20T10:00:00Z');
    (prisma as any).eventFeedback.findMany.mockResolvedValue([
      // event-level
      { id: 'f1', sessionId: null, rating: 5, npsScore: 10, comment: 'loved it', attendeeEmail: 'a@x.com', createdAt: now },
      { id: 'f2', sessionId: null, rating: 3, npsScore: 6, comment: null, attendeeEmail: null, createdAt: now },
      { id: 'f3', sessionId: null, rating: null, npsScore: 8, comment: '  ', attendeeEmail: null, createdAt: now },
      // session-level (s1)
      { id: 'f4', sessionId: 's1', rating: 4, npsScore: 9, comment: 'nice', attendeeEmail: null, createdAt: now },
      { id: 'f5', sessionId: 's1', rating: 2, npsScore: 3, comment: null, attendeeEmail: null, createdAt: now },
    ]);
    const svc = new FeedbackService(prisma);

    const out = await svc.getEventSummary('o1', 'e1');

    expect(out.total).toBe(5);

    // Event-level rows: ratings 5,3 -> avg 4.0 (2 ratings); nps 10,6,8 -> promoters1 passive1 detractor1
    expect(out.event.ratingCount).toBe(2);
    expect(out.event.avgRating).toBe(4);
    expect(out.event.npsCount).toBe(3);
    expect(out.event.promoters).toBe(1);
    expect(out.event.passives).toBe(1);
    expect(out.event.detractors).toBe(1);
    expect(out.event.nps).toBe(0); // (1-1)/3*100

    // Overall: ratings 5,3,4,2 -> avg 3.5 (4 ratings); nps 10,6,8,9,3 -> promoters 10,9=2; passive 8=1; detractors 6,3=2
    expect(out.overall.ratingCount).toBe(4);
    expect(out.overall.avgRating).toBe(3.5);
    expect(out.overall.npsCount).toBe(5);
    expect(out.overall.promoters).toBe(2);
    expect(out.overall.passives).toBe(1);
    expect(out.overall.detractors).toBe(2);
    expect(out.overall.nps).toBe(0); // (2-2)/5*100

    // Per-session: only s1 has feedback
    expect(out.sessions).toHaveLength(1);
    const s1 = out.sessions[0]!;
    expect(s1.sessionId).toBe('s1');
    expect(s1.title).toBe('Keynote');
    expect(s1.count).toBe(2);
    expect(s1.avgRating).toBe(3); // (4+2)/2
    expect(s1.nps).toBe(0); // promoter 9=1, detractor 3=1 -> (1-1)/2

    // Comments: only rows with non-empty comment (f1, f4). Whitespace f3 excluded.
    expect(out.comments.map((c) => c.id)).toEqual(['f1', 'f4']);
    expect(out.comments[0]!.target).toBe('Event overall');
    expect(out.comments[1]!.target).toBe('Keynote');
  });
});
