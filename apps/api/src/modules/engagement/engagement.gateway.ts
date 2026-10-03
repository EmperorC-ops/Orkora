import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';
import { EngagementService } from './engagement.service';

interface AuthedSocket extends Socket {
  data: {
    userId: string;
    // True when the socket authenticated with a ticket code rather than a JWT.
    // Ticket sockets get participant actions only, and only for their own event.
    viaTicket?: boolean;
    ticketEventId?: string;
  };
}

interface JwtPayload {
  sub: string;
}

/**
 * Real-time engagement gateway.
 *
 * Rooms are addressed by event id, so attendees in the same event share a
 * chat room and receive the same poll updates.
 *
 * Auth: clients pass EITHER `auth.token` (a JWT, for logged-in users and
 * organizers) OR `auth.ticket` (a ticket code, for attendees who hold a ticket
 * but have no account) on `io.connect`. The JWT is verified locally with the
 * same public key passport-jwt uses; the ticket code is resolved to its
 * registrant via EngagementService. Either way this only AUTHENTICATES the user.
 *
 * Authorization model: live participation (chat:message, qa:ask, poll:vote,
 * qa:upvote) is open to any authenticated user, matching the public live room
 * (the REST engagement reads are unauthenticated too). A ticket socket is
 * additionally pinned to its own event and can never perform organizer actions.
 * Organizer-only actions must be authorized explicitly here because they bypass
 * the REST RolesGuard: `qa:answer` posts an organizer-level reply, so the
 * service verifies the user is an organizer of the question's event org before
 * writing, and ticket sockets are refused it outright. Add the same
 * service-level org check to any future organizer socket action.
 *
 * Events client -> server:
 *   `chat:join`     { eventId }
 *   `chat:message`  { eventId, channelId, body, replyToId? }
 *   `poll:vote`     { pollId, optionIds }
 *
 * Events server -> client:
 *   `chat:message`  message
 *   `poll:update`   poll
 *   `presence`      { eventId, count }
 */
@WebSocketGateway({
  namespace: '/engagement',
  cors: { origin: '*' },
})
export class EngagementGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EngagementGateway.name);

  constructor(
    private readonly engagement: EngagementService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = (client.handshake.auth?.token ?? '') as string;
      const ticketCode = (client.handshake.auth?.ticket ?? '') as string;
      if (token) {
        const publicKey = this.cfg.getOrThrow<string>('JWT_PUBLIC_KEY');
        const payload = (await this.jwt.verifyAsync<JwtPayload>(token, {
          publicKey,
          algorithms: ['RS256'],
          issuer: 'orkora',
        })) as JwtPayload;
        (client as AuthedSocket).data.userId = payload.sub;
        (client as AuthedSocket).data.viaTicket = false;
      } else if (ticketCode) {
        // Attendee entering with the ticket they hold, no login required.
        const p = await this.engagement.resolveTicketParticipant(ticketCode);
        (client as AuthedSocket).data.userId = p.userId;
        (client as AuthedSocket).data.viaTicket = true;
        (client as AuthedSocket).data.ticketEventId = p.eventId;
      } else {
        throw new Error('No credential');
      }
    } catch (err) {
      this.logger.debug({ err }, 'Engagement socket rejected (bad credential)');
      client.disconnect(true);
    }
  }

  /**
   * A ticket socket may only act in its own event. Returns false (caller should
   * refuse the action) when a ticket-authed socket targets a different event.
   * JWT sockets are unrestricted here, exactly as before.
   */
  private eventAllowed(client: AuthedSocket, eventId: string): boolean {
    if (!client.data.viaTicket) return true;
    return !!eventId && eventId === client.data.ticketEventId;
  }

  handleDisconnect(client: Socket): void {
    // Update presence counts for rooms the socket was in.
    for (const room of client.rooms) {
      if (room.startsWith('event:')) {
        this.broadcastPresence(room.slice('event:'.length));
      }
    }
  }

  @SubscribeMessage('chat:join')
  async onJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { eventId: string },
  ) {
    if (!data?.eventId) return { ok: false };
    if (!this.eventAllowed(client, data.eventId)) return { ok: false };
    await client.join(`event:${data.eventId}`);
    const channel = await this.engagement.getOrCreateEventChat(data.eventId);
    const recent = await this.engagement.listMessages(data.eventId, channel.id, 50);
    this.broadcastPresence(data.eventId);
    return { ok: true, channelId: channel.id, recent };
  }

  @SubscribeMessage('chat:message')
  async onMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { eventId: string; channelId: string; body: string; replyToId?: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return { ok: false };
    if (!this.eventAllowed(client, data.eventId)) return { ok: false };
    try {
      const message = await this.engagement.postMessage({
        userId,
        channelId: data.channelId,
        body: data.body,
        replyToId: data.replyToId,
      });
      this.server.to(`event:${data.eventId}`).emit('chat:message', message);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('poll:vote')
  async onPollVote(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { eventId: string; pollId: string; optionIds: string[] },
  ) {
    const userId = client.data.userId;
    if (!userId) return { ok: false };
    if (!this.eventAllowed(client, data.eventId)) return { ok: false };
    try {
      await this.engagement.vote({
        userId,
        pollId: data.pollId,
        optionIds: data.optionIds,
      });
      const poll = await this.engagement.getPoll(data.pollId);
      this.server.to(`event:${data.eventId}`).emit('poll:update', poll);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('qa:ask')
  async onAsk(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { eventId: string; body: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return { ok: false };
    if (!this.eventAllowed(client, data.eventId)) return { ok: false };
    try {
      await this.engagement.askQuestion({
        eventId: data.eventId,
        userId,
        body: data.body,
      });
      const list = await this.engagement.listQuestions(data.eventId);
      this.server.to(`event:${data.eventId}`).emit('qa:list', list);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('qa:answer')
  async onAnswer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { eventId: string; questionId: string; body: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return { ok: false };
    // Organizer-only action: a ticket socket is never an organizer.
    if (client.data.viaTicket) return { ok: false, error: 'Organizers only' };
    try {
      await this.engagement.answerQuestion({
        questionId: data.questionId,
        userId,
        body: data.body,
      });
      const list = await this.engagement.listQuestions(data.eventId);
      this.server.to(`event:${data.eventId}`).emit('qa:list', list);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('qa:upvote')
  async onUpvote(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { eventId: string; questionId: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return { ok: false };
    if (!this.eventAllowed(client, data.eventId)) return { ok: false };
    try {
      await this.engagement.toggleUpvote({
        questionId: data.questionId,
        userId,
      });
      const list = await this.engagement.listQuestions(data.eventId);
      this.server.to(`event:${data.eventId}`).emit('qa:list', list);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /** Allows the REST controller to push poll updates after create/close. */
  emitPollUpdate(eventId: string, poll: unknown): void {
    this.server.to(`event:${eventId}`).emit('poll:update', poll);
  }

  /**
   * Push the organizer's on-screen item (or null when cleared) to everyone in
   * the event room, so participants' live pages update without a refresh.
   */
  emitSpotlightUpdate(eventId: string, spotlight: unknown): void {
    this.server.to(`event:${eventId}`).emit('spotlight:update', spotlight);
  }

  /** Tell everyone to drop a moderated chat message in real time. */
  emitChatDeleted(eventId: string, messageId: string): void {
    this.server.to(`event:${eventId}`).emit('chat:deleted', { id: messageId });
  }

  private broadcastPresence(eventId: string): void {
    const room = `event:${eventId}`;
    const count = this.server.sockets.adapter.rooms.get(room)?.size ?? 0;
    this.server.to(room).emit('presence', { eventId, count });
  }
}
