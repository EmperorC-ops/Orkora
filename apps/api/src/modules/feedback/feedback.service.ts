import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SubmitFeedbackDto } from './dto/feedback.dto';

/** NPS buckets. Promoters 9-10, passives 7-8, detractors 0-6. */
function npsBucket(score: number): 'promoter' | 'passive' | 'detractor' {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

interface FeedbackRow {
  id: string;
  sessionId: string | null;
  rating: number | null;
  npsScore: number | null;
  comment: string | null;
  attendeeEmail: string | null;
  createdAt: Date;
}

interface Aggregate {
  count: number;
  ratingCount: number;
  avgRating: number | null;
  npsCount: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps: number | null;
}

function aggregate(rows: FeedbackRow[]): Aggregate {
  let ratingSum = 0;
  let ratingCount = 0;
  let npsCount = 0;
  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const r of rows) {
    if (r.rating != null) {
      ratingSum += r.rating;
      ratingCount += 1;
    }
    if (r.npsScore != null) {
      npsCount += 1;
      const b = npsBucket(r.npsScore);
      if (b === 'promoter') promoters += 1;
      else if (b === 'passive') passives += 1;
      else detractors += 1;
    }
  }

  return {
    count: rows.length,
    ratingCount,
    avgRating: ratingCount ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
    npsCount,
    promoters,
    passives,
    detractors,
    nps: npsCount ? Math.round(((promoters - detractors) / npsCount) * 100) : null,
  };
}

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public submission from the event page. Resolves the event by its public
   * code, validates the target session (if any) belongs to that event, and
   * requires at least one signal so we never persist an empty row. Optionally
   * links the submitter's user record by email so the organizer can follow up.
   */
  async submitPublic(code: string, dto: SubmitFeedbackDto) {
    const hasSignal =
      dto.rating != null ||
      dto.npsScore != null ||
      (dto.comment != null && dto.comment.trim().length > 0);
    if (!hasSignal) {
      throw new BadRequestException(
        'Add a rating, an NPS score, or a comment before submitting.',
      );
    }

    const event = await this.prisma.event.findUnique({
      where: { code: code.toUpperCase() },
      select: {
        id: true,
        organizationId: true,
        status: true,
        organization: { select: { status: true } },
      },
    });
    if (
      !event ||
      event.status === 'draft' ||
      event.status === 'archived' ||
      event.organization.status === 'suspended'
    ) {
      throw new NotFoundException('Event not found');
    }

    if (dto.sessionId) {
      const session = await this.prisma.session.findFirst({
        where: { id: dto.sessionId, eventId: event.id },
        select: { id: true },
      });
      if (!session) {
        throw new BadRequestException('That session is not part of this event.');
      }
    }

    let userId: string | null = null;
    if (dto.email) {
      const user = await this.prisma.user.findFirst({
        where: { email: dto.email.toLowerCase() },
        select: { id: true },
      });
      userId = user?.id ?? null;
    }

    const comment = dto.comment?.trim() ? dto.comment.trim() : null;

    await this.prisma.eventFeedback.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        sessionId: dto.sessionId ?? null,
        userId,
        attendeeEmail: dto.email ? dto.email.toLowerCase() : null,
        rating: dto.rating ?? null,
        npsScore: dto.npsScore ?? null,
        comment,
      },
    });

    return { status: 'received' as const };
  }

  /**
   * Organizer summary for one event: overall aggregate (event-level rows),
   * a per-session breakdown, and the comment stream. Tenancy is enforced by
   * matching the event's organizationId to the caller's org.
   */
  async getEventSummary(orgId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId },
      select: { id: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const [rows, sessions] = await Promise.all([
      this.prisma.eventFeedback.findMany({
        where: { eventId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          sessionId: true,
          rating: true,
          npsScore: true,
          comment: true,
          attendeeEmail: true,
          createdAt: true,
        },
      }),
      this.prisma.session.findMany({
        where: { eventId },
        select: { id: true, title: true },
      }),
    ]);

    const titleById = new Map(sessions.map((s) => [s.id, s.title]));

    const eventLevel = rows.filter((r) => r.sessionId === null);
    const sessionLevel = rows.filter((r) => r.sessionId !== null);

    // Per-session aggregates, only for sessions that actually have feedback.
    const bySession = new Map<string, FeedbackRow[]>();
    for (const r of sessionLevel) {
      const key = r.sessionId as string;
      const list = bySession.get(key) ?? [];
      list.push(r);
      bySession.set(key, list);
    }
    const sessionSummaries = [...bySession.entries()]
      .map(([sessionId, list]) => ({
        sessionId,
        title: titleById.get(sessionId) ?? 'Untitled session',
        ...aggregate(list),
      }))
      .sort((a, b) => b.count - a.count);

    const comments = rows
      .filter((r) => r.comment && r.comment.trim().length > 0)
      .map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        target: r.sessionId
          ? titleById.get(r.sessionId) ?? 'Untitled session'
          : 'Event overall',
        rating: r.rating,
        npsScore: r.npsScore,
        comment: r.comment,
        attendeeEmail: r.attendeeEmail,
        createdAt: r.createdAt,
      }));

    return {
      total: rows.length,
      event: aggregate(eventLevel),
      overall: aggregate(rows),
      sessions: sessionSummaries,
      comments,
    };
  }
}
