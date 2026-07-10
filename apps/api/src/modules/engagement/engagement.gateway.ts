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
  data: { userId: string; eventRooms?: Set<string> };
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
 * Auth: clients pass `auth.token` on `io.connect`. We verify the JWT locally
 * with the same public key passport-jwt uses, which only AUTHENTICATES the user.
 *
 * Authorization model: live participation (chat:message, qa:ask, poll:vote,
 * qa:upvote) is open to any authenticated user, matching the public live room
 * (the REST engagement reads are unauthenticated too). Organizer-only actions
 * must be authorized explicitly here because they bypass the REST RolesGuard:
 * `qa:answer` posts an organizer-level reply, so the service verifies the user
 * is an organizer of the question's event org before writing. Add the same
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
      if (!token) throw new Error('No token');
      const publicKey = this.cfg.getOrThrow<string>('JWT_PUBLIC_KEY');
      const payload = (await this.jwt.verifyAsync<JwtPayload>(token, {
        publicKey,
        algorithms: ['RS256'],
        issuer: 'orkora',
      })) as JwtPayload;
      (client as AuthedSocket).data.userId = payload.sub;
    } catch (err) {
      this.logger.debug({ err }, 'Engagement socket rejected (bad token)');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    // By the time the `disconnect` event fires, socket.io has already removed
    // this socket from its rooms, so `client.rooms` is empty here. The previous
    // implementation iterated it and therefore never re-broadcast presence, so
    // counts only ever went up. We re-broadcast for the event rooms we tracked
    // on join instead; the adapter has already dropped this socket, so each
    // count reflects the decrement.
    const rooms = (client as AuthedSocket).data?.eventRooms;
    if (!rooms) return;
    for (const eventId of rooms) {
      this.broadcastPresence(eventId);
    }
  }

  @SubscribeMessage('chat:join')
  async onJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { eventId: string },
  ) {
    if (!data?.eventId) return { ok: false };
    await client.join(`event:${data.eventId}`);
    // Remember the event rooms this socket joined so handleDisconnect can
    // re-broadcast presence for them (client.rooms is empty by then).
    (client.data.eventRooms ??= new Set<string>()).add(data.eventId);
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

  private broadcastPresence(eventId: string): void {
    const room = `event:${eventId}`;
    const count = this.server.sockets.adapter.rooms.get(room)?.size ?? 0;
    this.server.to(room).emit('presence', { eventId, count });
  }
}
