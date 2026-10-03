import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface PollOption {
  id: string;
  label: string;
}

@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  // ----- live-room access by ticket -----

  /**
   * Resolve a ticket code to the participant it belongs to, so an attendee can
   * enter the live room with the ticket they already hold instead of a login.
   * The ticket code is a bearer credential (the same one that backs the public
   * /t/:code ticket page and recordings access). Only a live ticket admits:
   * 'issued' or 'checked_in'. A 'pending', 'cancelled', 'void', or unknown code
   * is rejected, as is a code from a different event than the caller claims.
   */
  async resolveTicketParticipant(code: string): Promise<{ userId: string; eventId: string }> {
    const trimmed = (code ?? '').trim();
    if (!trimmed) throw new NotFoundException('Ticket not found');
    const ticket = await this.prisma.ticket.findUnique({
      where: { code: trimmed },
      select: { status: true, registration: { select: { userId: true, eventId: true } } },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status !== 'issued' && ticket.status !== 'checked_in') {
      throw new ForbiddenException('This ticket is not valid for the live room');
    }
    return { userId: ticket.registration.userId, eventId: ticket.registration.eventId };
  }

  // ----- live spotlight (organizer "on screen now" broadcast) -----

  private shapeSpotlight(r: {
    kind: string;
    title: string | null;
    body: string | null;
    url: string | null;
    active: boolean;
    updatedAt: Date;
  }) {
    return {
      kind: r.kind,
      title: r.title,
      body: r.body,
      url: r.url,
      active: r.active,
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  /** The current on-screen item for an event, or null when none is active. */
  async getSpotlight(eventId: string) {
    const row = await this.prisma.liveSpotlight.findUnique({ where: { eventId } });
    if (!row || !row.active) return null;
    return this.shapeSpotlight(row);
  }

  /**
   * Set (or replace) the event's on-screen item. Org-scoped: the event must
   * belong to orgId. announcement needs a title or body; link and video need a
   * full URL. One row per event, upserted, always re-activated.
   */
  async setSpotlight(
    orgId: string,
    eventId: string,
    dto: { kind: string; title?: string | null; body?: string | null; url?: string | null },
    userId: string,
  ) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (!['announcement', 'link', 'video'].includes(dto.kind)) {
      throw new BadRequestException('Unknown spotlight kind');
    }
    const title = dto.title?.trim() || null;
    const body = dto.body?.trim() || null;
    const url = dto.url?.trim() || null;
    if ((dto.kind === 'link' || dto.kind === 'video') && !url) {
      throw new BadRequestException('A link is required for this kind');
    }
    if (dto.kind === 'announcement' && !title && !body) {
      throw new BadRequestException('Add a title or a message');
    }
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      throw new BadRequestException('The link must be a full URL starting with https://');
    }

    const row = await this.prisma.liveSpotlight.upsert({
      where: { eventId },
      create: { eventId, kind: dto.kind, title, body, url, active: true, updatedByUserId: userId },
      update: { kind: dto.kind, title, body, url, active: true, updatedByUserId: userId },
    });
    return this.shapeSpotlight(row);
  }

  /** Take the current item off screen (kept, but deactivated). Org-scoped. */
  async clearSpotlight(orgId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    await this.prisma.liveSpotlight.updateMany({ where: { eventId }, data: { active: false } });
    return null;
  }

  // ----- channels & messages -----

  /**
   * Returns the chat channel for an event. Lazily creates one on first use
   * so organizers do not have to think about it. The channel `kind` is
   * 'chat' for the event-wide room; we leave room for per-session channels
   * later.
   */
  async getOrCreateEventChat(eventId: string) {
    const existing = await this.prisma.channel.findFirst({
      where: { eventId, kind: 'chat', sessionId: null },
    });
    if (existing) return existing;
    return this.prisma.channel.create({
      data: { eventId, kind: 'chat', title: 'Event chat' },
    });
  }

  async listMessages(eventId: string, channelId: string, limit = 100) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.eventId !== eventId) throw new ForbiddenException('Wrong event');
    const rows = await this.prisma.message.findMany({
      where: { channelId, deletedAt: null },
      include: { user: { select: { fullName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
    // Public read: expose only the author's display name + avatar, never the
    // internal user id, to an unauthenticated viewer.
    return rows.reverse().map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      replyToId: m.replyToId,
      user: { fullName: m.user.fullName, avatarUrl: m.user.avatarUrl },
    }));
  }

  /**
   * Organizer-side chat feed for moderation. Verifies the caller organizes the
   * event, returns the live (non-deleted) messages oldest-first with the author
   * name so the console can show who said what.
   */
  async listChatForOrganizer(eventId: string, userId: string) {
    await this.assertEventOrganizer(userId, eventId);
    const channel = await this.getOrCreateEventChat(eventId);
    const rows = await this.prisma.message.findMany({
      where: { channelId: channel.id, deletedAt: null },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.reverse().map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      authorId: m.user?.id ?? null,
      authorName: m.user?.fullName ?? null,
    }));
  }

  /**
   * Soft-delete a chat message (moderation). Scoped to the event's chat channel
   * so an organizer cannot reach another event's messages. The public feed
   * (listMessages) already filters deletedAt, so it disappears for everyone.
   */
  async deleteChatMessage(eventId: string, userId: string, messageId: string) {
    await this.assertEventOrganizer(userId, eventId);
    const channel = await this.getOrCreateEventChat(eventId);
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { channelId: true },
    });
    if (!msg || msg.channelId !== channel.id) {
      throw new NotFoundException('Message not found');
    }
    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
    return { id: messageId };
  }

  /**
   * Confirm a chat channel, poll, or Q&A question belongs to the given event.
   * Used to pin a ticket socket to its own event on writes, so a ticket for
   * event A cannot post, vote, or upvote into event B by passing a foreign id.
   * Throws when the target is missing or belongs to a different event.
   */
  async assertTargetInEvent(
    target: { channelId?: string; pollId?: string; questionId?: string },
    eventId: string,
  ): Promise<void> {
    if (target.channelId) {
      const ch = await this.prisma.channel.findUnique({
        where: { id: target.channelId },
        select: { eventId: true },
      });
      if (!ch || ch.eventId !== eventId) throw new ForbiddenException('Wrong event');
    }
    if (target.pollId) {
      const poll = await this.prisma.poll.findUnique({
        where: { id: target.pollId },
        select: { session: { select: { eventId: true } } },
      });
      if (!poll || poll.session.eventId !== eventId) throw new ForbiddenException('Wrong event');
    }
    if (target.questionId) {
      const q = await this.prisma.message.findUnique({
        where: { id: target.questionId },
        select: { channel: { select: { eventId: true } } },
      });
      if (!q || q.channel.eventId !== eventId) throw new ForbiddenException('Wrong event');
    }
  }

  async postMessage(input: {
    userId: string;
    channelId: string;
    body: string;
    replyToId?: string;
  }) {
    const body = input.body.trim();
    if (!body) throw new BadRequestException('Message cannot be empty');
    if (body.length > 1000) throw new BadRequestException('Message is too long (max 1000 chars)');

    const channel = await this.prisma.channel.findUnique({
      where: { id: input.channelId },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    const message = await this.prisma.message.create({
      data: {
        channelId: input.channelId,
        userId: input.userId,
        body,
        replyToId: input.replyToId,
      },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    });
    return {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      replyToId: message.replyToId,
      eventId: channel.eventId,
      channelId: channel.id,
      user: {
        id: message.user.id,
        fullName: message.user.fullName,
        avatarUrl: message.user.avatarUrl,
      },
    };
  }

  // ----- Q&A -----

  /**
   * Returns the Q&A channel for an event, lazily creating it. Q&A is just
   * `messages` with `kind='qa'`; the body holds the question text. Replies
   * use the existing `replyToId` column. Upvotes live in `message_upvotes`.
   */
  async getOrCreateEventQa(eventId: string) {
    const existing = await this.prisma.channel.findFirst({
      where: { eventId, kind: 'qa', sessionId: null },
    });
    if (existing) return existing;
    return this.prisma.channel.create({
      data: { eventId, kind: 'qa', title: 'Questions' },
    });
  }

  async listQuestions(eventId: string, viewerId?: string) {
    const channel = await this.getOrCreateEventQa(eventId);
    const rows = await this.prisma.message.findMany({
      where: { channelId: channel.id, replyToId: null, deletedAt: null },
      include: {
        // Public read: author display name + avatar only, no internal user id.
        user: { select: { fullName: true, avatarUrl: true } },
        replies: {
          where: { deletedAt: null },
          include: { user: { select: { fullName: true, avatarUrl: true } } },
          orderBy: { createdAt: 'asc' },
          take: 8,
        },
        upvotes: viewerId
          ? { where: { userId: viewerId }, take: 1 }
          : { take: 0 },
        _count: { select: { upvotes: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    // Sort by upvotes (desc), then recency. Done in JS to keep the SQL
    // simple; for very large rooms we'll move this to a window function.
    rows.sort((a, b) => {
      const da = b._count.upvotes - a._count.upvotes;
      if (da !== 0) return da;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    return rows.map((q) => ({
      id: q.id,
      channelId: channel.id,
      body: q.body,
      createdAt: q.createdAt,
      user: q.user,
      upvotes: q._count.upvotes,
      hasUpvoted: viewerId ? q.upvotes.length > 0 : false,
      replies: q.replies.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt,
        user: r.user,
      })),
    }));
  }

  async askQuestion(input: { eventId: string; userId: string; body: string }) {
    const channel = await this.getOrCreateEventQa(input.eventId);
    return this.postMessage({
      userId: input.userId,
      channelId: channel.id,
      body: input.body,
    });
  }

  async answerQuestion(input: {
    questionId: string;
    userId: string;
    body: string;
  }) {
    const question = await this.prisma.message.findUnique({
      where: { id: input.questionId },
      include: { channel: { select: { eventId: true } } },
    });
    if (!question) throw new NotFoundException('Question not found');
    // Authorization: answering posts an organizer-level reply, so the actor must
    // be an organizer (or above) of THIS question's event's org. The websocket
    // only authenticates the user; without this check any authenticated attendee
    // could post "official" answers to any event's Q&A by id.
    await this.assertEventOrganizer(input.userId, question.channel.eventId);
    return this.postMessage({
      userId: input.userId,
      channelId: question.channelId,
      body: input.body,
      replyToId: input.questionId,
    });
  }

  /**
   * Throws unless `userId` has an organizer-or-above membership in the org that
   * owns `eventId`. Used to gate organizer-only socket actions, which bypass the
   * REST RolesGuard. DB-backed so it does not depend on JWT membership claims.
   */
  private async assertEventOrganizer(userId: string, eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { organizationId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        organizationId: event.organizationId,
        role: { in: ['owner', 'admin', 'organizer'] },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('Only event organizers can answer questions');
    }
  }

  async toggleUpvote(input: { questionId: string; userId: string }) {
    const existing = await this.prisma.messageUpvote.findUnique({
      where: { messageId_userId: { messageId: input.questionId, userId: input.userId } },
    });
    if (existing) {
      await this.prisma.messageUpvote.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.messageUpvote.create({
        data: { messageId: input.questionId, userId: input.userId },
      });
    }
    const count = await this.prisma.messageUpvote.count({
      where: { messageId: input.questionId },
    });
    return { upvoted: !existing, count };
  }

  // ----- Q&A moderation (organizer) -----

  /**
   * Marks (or unmarks) a question as answered. Setting `answered` stamps
   * `answeredAt`; clearing it nulls the column. Organizer-gated on the
   * question's own event so an organizer of one org cannot moderate another
   * org's Q&A by id.
   */
  async markQuestionAnswered(input: {
    questionId: string;
    userId: string;
    answered: boolean;
  }) {
    const question = await this.prisma.message.findUnique({
      where: { id: input.questionId },
      include: { channel: { select: { eventId: true } } },
    });
    if (!question) throw new NotFoundException('Question not found');
    await this.assertEventOrganizer(input.userId, question.channel.eventId);
    const updated = await this.prisma.message.update({
      where: { id: input.questionId },
      data: { answeredAt: input.answered ? new Date() : null },
      select: { id: true, answeredAt: true },
    });
    return { id: updated.id, answeredAt: updated.answeredAt };
  }

  /**
   * Hides (soft-deletes) or unhides a question. Hidden questions drop out of
   * the public `listQuestions` feed (which filters `deletedAt: null`) but stay
   * visible to organizers via `listQuestionsForOrganizer`.
   */
  async setQuestionHidden(input: {
    questionId: string;
    userId: string;
    hidden: boolean;
  }) {
    const question = await this.prisma.message.findUnique({
      where: { id: input.questionId },
      include: { channel: { select: { eventId: true } } },
    });
    if (!question) throw new NotFoundException('Question not found');
    await this.assertEventOrganizer(input.userId, question.channel.eventId);
    const updated = await this.prisma.message.update({
      where: { id: input.questionId },
      data: { deletedAt: input.hidden ? new Date() : null },
      select: { id: true, deletedAt: true },
    });
    return { id: updated.id, hidden: !!updated.deletedAt };
  }

  /**
   * Organizer view of the Q&A: returns ALL top-level questions including hidden
   * ones (we do not filter `deletedAt`) so moderators can unhide. Shapes the
   * moderation fields (answeredAt, hidden) alongside the usual body/upvotes.
   */
  async listQuestionsForOrganizer(eventId: string, userId: string) {
    await this.assertEventOrganizer(userId, eventId);
    const channel = await this.getOrCreateEventQa(eventId);
    const rows = await this.prisma.message.findMany({
      where: { channelId: channel.id, replyToId: null },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        _count: { select: { upvotes: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    // Most-upvoted first, then most recent (mirrors listQuestions ordering).
    rows.sort((a, b) => {
      const da = b._count.upvotes - a._count.upvotes;
      if (da !== 0) return da;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    return rows.map((q) => ({
      id: q.id,
      channelId: channel.id,
      body: q.body,
      createdAt: q.createdAt,
      answeredAt: q.answeredAt,
      hidden: !!q.deletedAt,
      upvotes: q._count.upvotes,
      authorName: q.user?.fullName ?? null,
    }));
  }

  // ----- polls -----

  async createPoll(input: {
    orgId: string;
    eventId: string;
    sessionId: string;
    question: string;
    options: string[];
    multiSelect?: boolean;
  }) {
    if (input.options.length < 2 || input.options.length > 8) {
      throw new BadRequestException('A poll needs 2 to 8 options');
    }
    // Tenancy: the org-scoped RolesGuard only proves membership in :orgId, not
    // that the body's sessionId belongs there. Verify the session belongs to
    // this event and this org before creating, so an organizer of one org
    // cannot attach a poll to another org's session by id.
    const session = await this.prisma.session.findFirst({
      where: { id: input.sessionId, event: { id: input.eventId, organizationId: input.orgId } },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Session not found for this event');
    const options: PollOption[] = input.options.map((label, i) => ({
      id: String(i + 1),
      label: label.trim(),
    }));
    return this.prisma.poll.create({
      data: {
        sessionId: input.sessionId,
        question: input.question.trim(),
        options: options as unknown as Prisma.InputJsonValue,
        multiSelect: input.multiSelect ?? false,
        status: 'open',
      },
    });
  }

  async listPollsForEvent(eventId: string) {
    const polls = await this.prisma.poll.findMany({
      where: { session: { eventId } },
      include: { votes: true, session: { select: { id: true, title: true } } },
      orderBy: { sessionId: 'asc' },
    });
    return polls.map((p) => this.shapePoll(p));
  }

  /**
   * Organizer-scoped poll list for an event. Tenancy-checks that the event
   * belongs to `orgId` before returning, so an organizer of one org cannot
   * read another org's polls by guessing the event id.
   */
  async listPolls(orgId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found for this org');
    const polls = await this.prisma.poll.findMany({
      where: { session: { eventId } },
      include: { votes: true, session: { select: { id: true, title: true } } },
      orderBy: { sessionId: 'asc' },
    });
    return polls.map((p) => this.shapePoll(p));
  }

  async getPoll(pollId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { votes: true, session: { select: { id: true, title: true, eventId: true } } },
    });
    if (!poll) throw new NotFoundException('Poll not found');
    return this.shapePoll(poll);
  }

  async closePoll(input: { orgId: string; eventId: string; pollId: string }) {
    // Tenancy: only close a poll whose session's event belongs to this org, so
    // an organizer cannot close another org's poll by guessing its id.
    const owned = await this.prisma.poll.findFirst({
      where: {
        id: input.pollId,
        session: { event: { id: input.eventId, organizationId: input.orgId } },
      },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Poll not found for this event');
    const poll = await this.prisma.poll.update({
      where: { id: input.pollId },
      data: { status: 'closed', closedAt: new Date() },
      include: { votes: true, session: { select: { id: true, title: true, eventId: true } } },
    });
    return this.shapePoll(poll);
  }

  async vote(input: { userId: string; pollId: string; optionIds: string[] }) {
    const poll = await this.prisma.poll.findUnique({ where: { id: input.pollId } });
    if (!poll) throw new NotFoundException('Poll not found');
    if (poll.status !== 'open') throw new BadRequestException('Poll is not open');
    if (input.optionIds.length === 0) throw new BadRequestException('Pick at least one option');
    if (!poll.multiSelect && input.optionIds.length > 1) {
      throw new BadRequestException('This poll only allows one selection');
    }
    const validIds = new Set((poll.options as unknown as PollOption[]).map((o) => o.id));
    for (const id of input.optionIds) {
      if (!validIds.has(id)) throw new BadRequestException(`Unknown option: ${id}`);
    }
    return this.prisma.pollVote.upsert({
      where: { pollId_userId: { pollId: input.pollId, userId: input.userId } },
      create: { pollId: input.pollId, userId: input.userId, optionIds: input.optionIds },
      update: { optionIds: input.optionIds, createdAt: new Date() },
    });
  }

  private shapePoll(poll: {
    id: string;
    question: string;
    options: Prisma.JsonValue;
    status: string;
    multiSelect: boolean;
    closedAt: Date | null;
    sessionId: string;
    votes: { optionIds: string[] }[];
    session?: { id: string; title: string; eventId?: string } | null;
  }) {
    const opts = poll.options as unknown as PollOption[];
    const tally: Record<string, number> = {};
    for (const o of opts) tally[o.id] = 0;
    for (const v of poll.votes) for (const id of v.optionIds) tally[id] = (tally[id] ?? 0) + 1;
    return {
      id: poll.id,
      sessionId: poll.sessionId,
      session: poll.session ?? null,
      question: poll.question,
      options: opts.map((o) => ({ ...o, votes: tally[o.id] ?? 0 })),
      status: poll.status,
      multiSelect: poll.multiSelect,
      closedAt: poll.closedAt,
      totalVotes: poll.votes.length,
    };
  }
}
