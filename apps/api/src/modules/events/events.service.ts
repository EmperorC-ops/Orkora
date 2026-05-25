import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  CreateEventDto,
  CreateSessionDto,
  CreateSpeakerDto,
  CreateTicketTierDto,
  CreateTrackDto,
  EventStatus,
  ReorderTicketTiersDto,
  UpdateEventDto,
  UpdateSessionDto,
  UpdateTicketTierDto,
} from './dto/event.dto';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // omit confusing chars
const SAFE_STATUS: EventStatus[] = ['draft', 'published', 'live', 'ended', 'archived'];

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------- Public reads --------

  async findPublicByCode(code: string) {
    const event = await this.prisma.event.findUnique({
      where: { code: code.toUpperCase() },
      select: {
        id: true,
        code: true,
        slug: true,
        title: true,
        description: true,
        kind: true,
        startAt: true,
        endAt: true,
        timezone: true,
        bannerUrl: true,
        theme: true,
        status: true,
        organization: { select: { name: true, logoUrl: true, brandColor: true, slug: true, status: true } },
        tracks: { select: { id: true, name: true, color: true } },
        sessions: {
          orderBy: { startAt: 'asc' },
          select: {
            id: true,
            title: true,
            description: true,
            startAt: true,
            endAt: true,
            trackId: true,
            streamUrl: true,
          },
        },
        speakers: {
          select: {
            id: true,
            fullName: true,
            title: true,
            bio: true,
            avatarUrl: true,
            socialLinks: true,
          },
        },
        tiers: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            priceMinor: true,
            currency: true,
            quantityTotal: true,
            quantitySold: true,
            minPerOrder: true,
            maxPerOrder: true,
            saleStartsAt: true,
            saleEndsAt: true,
            isGroup: true,
            groupSize: true,
            position: true,
          },
        },
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
    return this.serializeEvent(event);
  }

  async findPublicBySlug(orgSlug: string, eventSlug: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        slug: eventSlug.toLowerCase(),
        organization: { slug: orgSlug.toLowerCase() },
      },
      select: {
        id: true,
        code: true,
        slug: true,
        title: true,
        description: true,
        kind: true,
        startAt: true,
        endAt: true,
        timezone: true,
        bannerUrl: true,
        theme: true,
        status: true,
        organization: { select: { name: true, logoUrl: true, brandColor: true, slug: true, status: true } },
        tracks: { select: { id: true, name: true, color: true } },
        sessions: {
          orderBy: { startAt: 'asc' },
          select: {
            id: true,
            title: true,
            description: true,
            startAt: true,
            endAt: true,
            trackId: true,
            streamUrl: true,
          },
        },
        speakers: {
          select: {
            id: true,
            fullName: true,
            title: true,
            bio: true,
            avatarUrl: true,
            socialLinks: true,
          },
        },
        tiers: {
          where: { saleEndsAt: null },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            priceMinor: true,
            currency: true,
            quantityTotal: true,
            quantitySold: true,
            minPerOrder: true,
            maxPerOrder: true,
            saleStartsAt: true,
            saleEndsAt: true,
            isGroup: true,
            groupSize: true,
            position: true,
          },
        },
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
    return this.serializeEvent(event);
  }

  /**
   * Authenticated read-by-id (GET /v1/events/:id). This route is JWT-guarded but
   * NOT org-scoped, so it must never expose another org's unpublished work:
   * draft/archived events, and events of suspended orgs, are hidden here exactly
   * as on the public by-code/by-slug reads. Organizers see their own drafts
   * through the org-scoped getForOrg(orgId, eventId) instead. The status +
   * organization filters live in the query so a non-matching id simply 404s.
   */
  async findById(id: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id,
        status: { notIn: ['draft', 'archived'] },
        organization: { status: { not: 'suspended' } },
      },
      include: {
        tracks: true,
        sessions: { orderBy: { startAt: 'asc' } },
        speakers: true,
        tiers: { orderBy: { position: 'asc' } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return this.serializeEvent(event);
  }

  // -------- Organizer CRUD --------

  async createForOrg(orgId: string, dto: CreateEventDto) {
    this.assertDateRange(dto.startAt, dto.endAt);
    const code = await this.generateUniqueCode();
    const slug = await this.generateUniqueSlug(orgId, dto.title);

    const event = await this.prisma.event.create({
      data: {
        organizationId: orgId,
        code,
        slug,
        title: dto.title,
        description: dto.description,
        kind: dto.kind,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        timezone: dto.timezone ?? 'Africa/Lagos',
        capacity: dto.capacity,
        bannerUrl: dto.bannerUrl,
        theme: (dto.theme ?? {}) as Prisma.InputJsonValue,
        status: 'draft',
      },
    });
    return this.serializeEvent(event);
  }

  async listForOrg(orgId: string, status?: EventStatus) {
    const where = status ? { organizationId: orgId, status } : { organizationId: orgId };
    const events = await this.prisma.event.findMany({
      where,
      orderBy: { startAt: 'desc' },
      select: {
        id: true,
        code: true,
        slug: true,
        title: true,
        kind: true,
        startAt: true,
        endAt: true,
        timezone: true,
        status: true,
        bannerUrl: true,
        capacity: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return events;
  }

  async getForOrg(orgId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId },
      include: {
        tracks: true,
        sessions: { orderBy: { startAt: 'asc' } },
        speakers: true,
        tiers: { orderBy: { position: 'asc' } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return this.serializeEvent(event);
  }

  async update(orgId: string, eventId: string, dto: UpdateEventDto) {
    await this.assertEventInOrg(orgId, eventId);

    const existing = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!existing) throw new NotFoundException('Event not found');

    const startAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : existing.endAt;
    if (endAt <= startAt) {
      throw new BadRequestException('endAt must be after startAt');
    }

    let slug = existing.slug;
    if (dto.title && dto.title !== existing.title) {
      slug = await this.generateUniqueSlug(orgId, dto.title, eventId);
    }

    const event = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        title: dto.title ?? undefined,
        slug,
        description: dto.description ?? undefined,
        kind: dto.kind ?? undefined,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        timezone: dto.timezone ?? undefined,
        capacity: dto.capacity ?? undefined,
        bannerUrl: dto.bannerUrl ?? undefined,
        theme: (dto.theme ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return this.serializeEvent(event);
  }

  async publish(orgId: string, eventId: string) {
    const event = await this.assertEventInOrg(orgId, eventId);
    if (event.status === 'archived') {
      throw new BadRequestException('Cannot publish an archived event');
    }
    if (event.endAt <= new Date()) {
      throw new BadRequestException('Cannot publish: event has already ended');
    }
    return this.serializeEvent(
      await this.prisma.event.update({
        where: { id: eventId },
        data: { status: 'published' },
      }),
    );
  }

  async unpublish(orgId: string, eventId: string) {
    const event = await this.assertEventInOrg(orgId, eventId);
    if (event.status === 'archived') {
      throw new BadRequestException('Cannot unpublish an archived event');
    }
    return this.serializeEvent(
      await this.prisma.event.update({
        where: { id: eventId },
        data: { status: 'draft' },
      }),
    );
  }

  async archive(orgId: string, eventId: string) {
    await this.assertEventInOrg(orgId, eventId);
    return this.serializeEvent(
      await this.prisma.event.update({
        where: { id: eventId },
        data: { status: 'archived' },
      }),
    );
  }

  async setStatus(orgId: string, eventId: string, status: EventStatus) {
    if (!SAFE_STATUS.includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    await this.assertEventInOrg(orgId, eventId);
    return this.serializeEvent(
      await this.prisma.event.update({
        where: { id: eventId },
        data: { status },
      }),
    );
  }

  async deleteEvent(orgId: string, eventId: string) {
    const event = await this.assertEventInOrg(orgId, eventId);
    if (event.status !== 'draft') {
      throw new BadRequestException('Only draft events can be deleted. Archive instead.');
    }
    const reg = await this.prisma.registration.count({ where: { eventId } });
    if (reg > 0) {
      throw new BadRequestException('Event has registrations. Archive instead.');
    }
    await this.prisma.event.delete({ where: { id: eventId } });
    return { ok: true };
  }

  // -------- Tracks --------

  async createTrack(orgId: string, eventId: string, dto: CreateTrackDto) {
    await this.assertEventInOrg(orgId, eventId);
    return this.prisma.track.create({
      data: { eventId, name: dto.name, color: dto.color },
    });
  }

  async listTracks(orgId: string, eventId: string) {
    await this.assertEventInOrg(orgId, eventId);
    return this.prisma.track.findMany({ where: { eventId }, orderBy: { name: 'asc' } });
  }

  async deleteTrack(orgId: string, eventId: string, trackId: string) {
    await this.assertEventInOrg(orgId, eventId);
    const track = await this.prisma.track.findFirst({ where: { id: trackId, eventId } });
    if (!track) throw new NotFoundException('Track not found');
    await this.prisma.track.delete({ where: { id: trackId } });
    return { ok: true };
  }

  // -------- Sessions --------

  async createSession(orgId: string, eventId: string, dto: CreateSessionDto) {
    await this.assertEventInOrg(orgId, eventId);
    this.assertDateRange(dto.startAt, dto.endAt);
    if (dto.trackId) {
      const track = await this.prisma.track.findFirst({
        where: { id: dto.trackId, eventId },
      });
      if (!track) throw new BadRequestException('Track does not belong to this event');
    }
    return this.prisma.session.create({
      data: {
        eventId,
        title: dto.title,
        description: dto.description,
        trackId: dto.trackId ?? null,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        streamUrl: dto.streamUrl,
        capacity: dto.capacity,
        requiresRsvp: dto.requiresRsvp ?? false,
      },
    });
  }

  async updateSession(
    orgId: string,
    eventId: string,
    sessionId: string,
    dto: UpdateSessionDto,
  ) {
    await this.assertEventInOrg(orgId, eventId);
    const existing = await this.prisma.session.findFirst({
      where: { id: sessionId, eventId },
    });
    if (!existing) throw new NotFoundException('Session not found');

    const startAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : existing.endAt;
    if (endAt <= startAt) {
      throw new BadRequestException('endAt must be after startAt');
    }
    if (dto.trackId) {
      const track = await this.prisma.track.findFirst({
        where: { id: dto.trackId, eventId },
      });
      if (!track) throw new BadRequestException('Track does not belong to this event');
    }
    return this.prisma.session.update({
      where: { id: sessionId },
      data: {
        title: dto.title ?? undefined,
        description: dto.description ?? undefined,
        trackId: dto.trackId === null ? null : dto.trackId ?? undefined,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        streamUrl: dto.streamUrl ?? undefined,
        capacity: dto.capacity ?? undefined,
        requiresRsvp: dto.requiresRsvp ?? undefined,
      },
    });
  }

  async deleteSession(orgId: string, eventId: string, sessionId: string) {
    await this.assertEventInOrg(orgId, eventId);
    const existing = await this.prisma.session.findFirst({
      where: { id: sessionId, eventId },
    });
    if (!existing) throw new NotFoundException('Session not found');
    await this.prisma.session.delete({ where: { id: sessionId } });
    return { ok: true };
  }

  // -------- Speakers --------

  async createSpeaker(orgId: string, eventId: string, dto: CreateSpeakerDto) {
    await this.assertEventInOrg(orgId, eventId);
    return this.prisma.speaker.create({
      data: {
        eventId,
        fullName: dto.fullName,
        title: dto.title,
        bio: dto.bio,
        avatarUrl: dto.avatarUrl,
        socialLinks: dto.socialLinks ?? {},
      },
    });
  }

  async listSpeakers(orgId: string, eventId: string) {
    await this.assertEventInOrg(orgId, eventId);
    return this.prisma.speaker.findMany({
      where: { eventId },
      orderBy: { fullName: 'asc' },
    });
  }

  async deleteSpeaker(orgId: string, eventId: string, speakerId: string) {
    await this.assertEventInOrg(orgId, eventId);
    const speaker = await this.prisma.speaker.findFirst({
      where: { id: speakerId, eventId },
    });
    if (!speaker) throw new NotFoundException('Speaker not found');
    await this.prisma.speaker.delete({ where: { id: speakerId } });
    return { ok: true };
  }

  // -------- Ticket tiers --------

  async createTier(orgId: string, eventId: string, dto: CreateTicketTierDto) {
    await this.assertEventInOrg(orgId, eventId);
    if (dto.maxPerOrder && dto.minPerOrder && dto.maxPerOrder < dto.minPerOrder) {
      throw new BadRequestException('maxPerOrder must be >= minPerOrder');
    }
    if (dto.saleStartsAt && dto.saleEndsAt) {
      this.assertDateRange(dto.saleStartsAt, dto.saleEndsAt);
    }
    const last = await this.prisma.ticketTier.findFirst({
      where: { eventId },
      orderBy: { position: 'desc' },
    });
    const position = dto.position ?? (last ? last.position + 1 : 0);

    const tier = await this.prisma.ticketTier.create({
      data: {
        eventId,
        name: dto.name,
        description: dto.description,
        priceMinor: BigInt(dto.priceMinor),
        currency: (dto.currency ?? 'NGN').toUpperCase(),
        quantityTotal: dto.quantityTotal,
        minPerOrder: dto.minPerOrder ?? 1,
        maxPerOrder: dto.maxPerOrder ?? 10,
        saleStartsAt: dto.saleStartsAt ? new Date(dto.saleStartsAt) : null,
        saleEndsAt: dto.saleEndsAt ? new Date(dto.saleEndsAt) : null,
        isGroup: dto.isGroup ?? false,
        groupSize: dto.groupSize,
        position,
      },
    });
    return this.serializeTier(tier);
  }

  async listTiers(orgId: string, eventId: string) {
    await this.assertEventInOrg(orgId, eventId);
    const tiers = await this.prisma.ticketTier.findMany({
      where: { eventId },
      orderBy: { position: 'asc' },
    });
    return tiers.map((t) => this.serializeTier(t));
  }

  async updateTier(
    orgId: string,
    eventId: string,
    tierId: string,
    dto: UpdateTicketTierDto,
  ) {
    await this.assertEventInOrg(orgId, eventId);
    const existing = await this.prisma.ticketTier.findFirst({
      where: { id: tierId, eventId },
    });
    if (!existing) throw new NotFoundException('Ticket tier not found');

    const tier = await this.prisma.ticketTier.update({
      where: { id: tierId },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        priceMinor: dto.priceMinor !== undefined ? BigInt(dto.priceMinor) : undefined,
        currency: dto.currency ? dto.currency.toUpperCase() : undefined,
        quantityTotal: dto.quantityTotal ?? undefined,
        minPerOrder: dto.minPerOrder ?? undefined,
        maxPerOrder: dto.maxPerOrder ?? undefined,
        saleStartsAt: dto.saleStartsAt ? new Date(dto.saleStartsAt) : undefined,
        saleEndsAt: dto.saleEndsAt ? new Date(dto.saleEndsAt) : undefined,
        isGroup: dto.isGroup ?? undefined,
        groupSize: dto.groupSize ?? undefined,
        position: dto.position ?? undefined,
      },
    });
    return this.serializeTier(tier);
  }

  async deleteTier(orgId: string, eventId: string, tierId: string) {
    await this.assertEventInOrg(orgId, eventId);
    const tier = await this.prisma.ticketTier.findFirst({
      where: { id: tierId, eventId },
    });
    if (!tier) throw new NotFoundException('Ticket tier not found');
    if (tier.quantitySold > 0) {
      throw new BadRequestException('Cannot delete a tier that has sold tickets');
    }
    await this.prisma.ticketTier.delete({ where: { id: tierId } });
    return { ok: true };
  }

  async reorderTiers(orgId: string, eventId: string, dto: ReorderTicketTiersDto) {
    await this.assertEventInOrg(orgId, eventId);
    const ids = dto.items.map((i) => i.id);
    const owned = await this.prisma.ticketTier.findMany({
      where: { id: { in: ids }, eventId },
      select: { id: true },
    });
    if (owned.length !== ids.length) {
      throw new BadRequestException('One or more tiers do not belong to this event');
    }
    await this.prisma.$transaction(
      dto.items.map((i) =>
        this.prisma.ticketTier.update({
          where: { id: i.id },
          data: { position: i.position },
        }),
      ),
    );
    return this.listTiers(orgId, eventId);
  }

  // -------- Helpers --------

  private async assertEventInOrg(orgId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private assertDateRange(start: string | Date, end: string | Date) {
    const s = start instanceof Date ? start : new Date(start);
    const e = end instanceof Date ? end : new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    if (e <= s) {
      throw new BadRequestException('endAt must be after startAt');
    }
  }

  private async generateUniqueCode(maxAttempts = 8): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
      const code = this.randomCode(6);
      const existing = await this.prisma.event.findUnique({ where: { code } });
      if (!existing) return code;
    }
    throw new ConflictException('Could not allocate event code, please retry');
  }

  private randomCode(length: number): string {
    const bytes = randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) {
      out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    }
    return out;
  }

  private async generateUniqueSlug(
    orgId: string,
    title: string,
    excludeEventId?: string,
  ): Promise<string> {
    const base = this.slugify(title) || 'event';
    let candidate = base.slice(0, 60);
    let n = 1;
    // Try base, base-2, base-3, ... up to 50
    while (n < 50) {
      const existing = await this.prisma.event.findFirst({
        where: {
          organizationId: orgId,
          slug: candidate,
          ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
        },
        select: { id: true },
      });
      if (!existing) return candidate;
      n += 1;
      candidate = `${base.slice(0, 56)}-${n}`;
    }
    // Last resort: append a random short suffix
    return `${base.slice(0, 50)}-${this.randomCode(4).toLowerCase()}`;
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  /**
   * Convert BigInt fields (priceMinor) to a JSON-safe number. We constrain
   * tier prices to fit Number.MAX_SAFE_INTEGER in practice, so this is safe.
   */
  private serializeTier<T extends { priceMinor: bigint }>(tier: T): Omit<T, 'priceMinor'> & {
    priceMinor: number;
  } {
    return { ...tier, priceMinor: Number(tier.priceMinor) };
  }

  private serializeEvent<T extends object>(event: T): T {
    const tiers = (event as Record<string, unknown>).tiers;
    if (Array.isArray(tiers)) {
      return {
        ...event,
        tiers: tiers.map((t: { priceMinor: bigint }) => ({
          ...t,
          priceMinor: Number(t.priceMinor),
        })),
      } as T;
    }
    return event;
  }
}
