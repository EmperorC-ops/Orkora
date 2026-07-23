import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { StorageService } from '../uploads/storage.service';
import {
  CreateRecordingDto,
  UpdateRecordingDto,
  type RecordingVisibility,
} from './dto/recording.dto';

/**
 * Recording library + gated player.
 *
 * Organizer endpoints are tenancy-scoped (event must belong to the caller's
 * org). Public endpoints resolve the event by its public code and only ever
 * expose published recordings. Playback is gated by visibility:
 *   - 'public' streams to anyone.
 *   - 'ticket' requires any valid issued ticket for the event.
 *   - 'tier' requires an issued ticket whose tier matches requiredTierId.
 *
 * We deliberately never return the raw url/storageKey from the list endpoint
 * for gated recordings. The playback URL is only handed back from
 * resolvePlayback after the ticket check passes, so a gated video cannot be
 * scraped from the public listing.
 */
@Injectable()
export class RecordingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // --------------------------------------------------------------------------
  // Organizer
  // --------------------------------------------------------------------------

  async createRecording(orgId: string, eventId: string, dto: CreateRecordingDto) {
    await this.assertEvent(orgId, eventId);

    if (dto.source === 'link') {
      if (!dto.url) {
        throw new BadRequestException('A link recording needs a url.');
      }
    } else {
      if (!dto.storageKey) {
        throw new BadRequestException('An uploaded recording needs a storageKey.');
      }
    }

    if (dto.sessionId) {
      await this.assertSession(eventId, dto.sessionId);
    }

    // Resolve visibility + tier. When a tier is supplied we force visibility to
    // 'tier' so the two fields cannot drift out of sync.
    let visibility: RecordingVisibility = dto.visibility;
    let requiredTierId: string | null = null;
    if (dto.requiredTierId) {
      await this.assertTier(eventId, dto.requiredTierId);
      visibility = 'tier';
      requiredTierId = dto.requiredTierId;
    } else if (dto.visibility === 'tier') {
      throw new BadRequestException(
        'A tier-gated recording needs a requiredTierId.',
      );
    }

    const recording = await this.prisma.recording.create({
      data: {
        eventId,
        sessionId: dto.sessionId ?? null,
        title: dto.title.trim(),
        description: dto.description?.trim() ? dto.description.trim() : null,
        source: dto.source,
        url: dto.source === 'link' ? dto.url ?? null : null,
        storageKey: dto.source === 'upload' ? dto.storageKey ?? null : null,
        durationSec: dto.durationSec ?? null,
        visibility,
        requiredTierId,
        publishedAt: dto.publish ? new Date() : null,
      },
    });
    return this.shapeForOrganizer(recording, null);
  }

  async listForOrganizer(orgId: string, eventId: string) {
    await this.assertEvent(orgId, eventId);
    const recordings = await this.prisma.recording.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: { session: { select: { title: true } } },
    });
    return recordings.map((r) => this.shapeForOrganizer(r, r.session?.title ?? null));
  }

  async updateRecording(
    orgId: string,
    eventId: string,
    recordingId: string,
    dto: UpdateRecordingDto,
  ) {
    await this.assertEvent(orgId, eventId);
    const existing = await this.prisma.recording.findFirst({
      where: { id: recordingId, eventId },
    });
    if (!existing) throw new NotFoundException('Recording not found');

    const data: Record<string, unknown> = {};

    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() ? dto.description.trim() : null;
    }
    if (dto.durationSec !== undefined) data.durationSec = dto.durationSec;

    // Session move: null clears, a value is validated against the event.
    if (dto.sessionId !== undefined) {
      if (dto.sessionId) await this.assertSession(eventId, dto.sessionId);
      data.sessionId = dto.sessionId ?? null;
    }

    // Source + payload. When switching source we clear the opposite field so a
    // recording never carries both a url and a storageKey.
    const nextSource = dto.source ?? existing.source;
    if (dto.source !== undefined || dto.url !== undefined || dto.storageKey !== undefined) {
      if (nextSource === 'link') {
        const url = dto.url ?? existing.url;
        if (!url) throw new BadRequestException('A link recording needs a url.');
        data.source = 'link';
        data.url = url;
        data.storageKey = null;
      } else {
        const storageKey = dto.storageKey ?? existing.storageKey;
        if (!storageKey) {
          throw new BadRequestException('An uploaded recording needs a storageKey.');
        }
        data.source = 'upload';
        data.storageKey = storageKey;
        data.url = null;
      }
    }

    // Visibility + tier. A supplied tier forces 'tier'; clearing the tier while
    // asking for 'tier' is rejected.
    if (dto.requiredTierId !== undefined || dto.visibility !== undefined) {
      if (dto.requiredTierId) {
        await this.assertTier(eventId, dto.requiredTierId);
        data.visibility = 'tier';
        data.requiredTierId = dto.requiredTierId;
      } else if (dto.visibility === 'tier') {
        throw new BadRequestException(
          'A tier-gated recording needs a requiredTierId.',
        );
      } else if (dto.visibility !== undefined) {
        data.visibility = dto.visibility;
        data.requiredTierId = null;
      }
    }

    if (dto.publish !== undefined) {
      data.publishedAt = dto.publish ? existing.publishedAt ?? new Date() : null;
    }

    const updated = await this.prisma.recording.update({
      where: { id: existing.id },
      data,
      include: { session: { select: { title: true } } },
    });
    return this.shapeForOrganizer(updated, updated.session?.title ?? null);
  }

  async deleteRecording(orgId: string, eventId: string, recordingId: string) {
    await this.assertEvent(orgId, eventId);
    const existing = await this.prisma.recording.findFirst({
      where: { id: recordingId, eventId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Recording not found');
    await this.prisma.recording.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  // --------------------------------------------------------------------------
  // Public
  // --------------------------------------------------------------------------

  async listPublic(eventCode: string) {
    const event = await this.resolvePublicEvent(eventCode);
    const recordings = await this.prisma.recording.findMany({
      where: { eventId: event.id, publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      include: { session: { select: { title: true } } },
    });
    return recordings.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      sessionTitle: r.session?.title ?? null,
      visibility: r.visibility,
      requiresTicket: r.visibility !== 'public',
      durationSec: r.durationSec,
    }));
  }

  /**
   * Resolve a playback URL for one recording. Ungated recordings stream
   * straight away; gated ones require a ticket code that we validate against
   * the event (and, for tier-gated, the specific tier). On success we return
   * the URL the player should load.
   */
  async resolvePlayback(
    eventCode: string,
    recordingId: string,
    ticketCode?: string,
  ) {
    const event = await this.resolvePublicEvent(eventCode);
    const recording = await this.prisma.recording.findFirst({
      where: { id: recordingId, eventId: event.id, publishedAt: { not: null } },
    });
    if (!recording) throw new NotFoundException('Recording not found');

    if (recording.visibility !== 'public') {
      await this.assertTicketAccess(event.id, recording, ticketCode);
    }

    return {
      id: recording.id,
      title: recording.title,
      source: recording.source,
      durationSec: recording.durationSec,
      playbackUrl: this.playbackUrlFor(recording),
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async assertEvent(orgId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private async assertSession(eventId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, eventId },
      select: { id: true },
    });
    if (!session) {
      throw new BadRequestException('That session is not part of this event.');
    }
    return session;
  }

  private async assertTier(eventId: string, tierId: string) {
    const tier = await this.prisma.ticketTier.findFirst({
      where: { id: tierId, eventId },
      select: { id: true },
    });
    if (!tier) {
      throw new BadRequestException('That ticket tier is not part of this event.');
    }
    return tier;
  }

  private async resolvePublicEvent(code: string) {
    const event = await this.prisma.event.findUnique({
      where: { code: code.toUpperCase() },
      select: {
        id: true,
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
    return event;
  }

  private async assertTicketAccess(
    eventId: string,
    recording: { visibility: string; requiredTierId: string | null },
    ticketCode?: string,
  ) {
    const code = ticketCode?.trim();
    if (!code) {
      throw new ForbiddenException(
        'This recording is for ticket holders. Enter your ticket code.',
      );
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { code: code.toUpperCase() },
      select: {
        status: true,
        tierId: true,
        registration: { select: { eventId: true } },
      },
    });

    const valid =
      ticket &&
      ticket.status === 'issued' &&
      ticket.registration.eventId === eventId;
    if (!valid) {
      throw new ForbiddenException(
        'That ticket code is not valid for this event.',
      );
    }

    if (recording.visibility === 'tier') {
      if (ticket.tierId !== recording.requiredTierId) {
        const tier = await this.prisma.ticketTier.findUnique({
          where: { id: recording.requiredTierId ?? '' },
          select: { name: true },
        });
        const tierName = tier?.name ?? 'a specific tier';
        throw new ForbiddenException(
          `This recording is for ${tierName} ticket holders.`,
        );
      }
    }
  }

  private playbackUrlFor(recording: {
    source: string;
    url: string | null;
    storageKey: string | null;
  }): string {
    if (recording.source === 'link') {
      if (!recording.url) {
        throw new NotFoundException('This recording has no playable source.');
      }
      return recording.url;
    }
    // Uploaded recordings live in the public-read R2 media bucket, so we hand
    // back the public URL derived from S3_PUBLIC_BASE_URL. No per-object
    // signing is needed while the bucket serves objects publicly.
    if (!recording.storageKey) {
      throw new NotFoundException('This recording has no playable source.');
    }
    return this.storage.publicUrlFor(recording.storageKey);
  }

  private shapeForOrganizer(
    recording: {
      id: string;
      eventId: string;
      sessionId: string | null;
      title: string;
      description: string | null;
      source: string;
      url: string | null;
      storageKey: string | null;
      durationSec: number | null;
      visibility: string;
      requiredTierId: string | null;
      publishedAt: Date | null;
      createdAt: Date;
    },
    sessionTitle: string | null,
  ) {
    return {
      id: recording.id,
      eventId: recording.eventId,
      sessionId: recording.sessionId,
      sessionTitle,
      title: recording.title,
      description: recording.description,
      source: recording.source,
      url: recording.url,
      storageKey: recording.storageKey,
      durationSec: recording.durationSec,
      visibility: recording.visibility,
      requiredTierId: recording.requiredTierId,
      published: recording.publishedAt !== null,
      publishedAt: recording.publishedAt?.toISOString() ?? null,
      createdAt: recording.createdAt.toISOString(),
    };
  }
}
