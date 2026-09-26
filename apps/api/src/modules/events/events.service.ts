import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  CreateEventDto,
  CreateSessionDto,
  CreateSpeakerDto,
  UpdateSpeakerDto,
  UpdateTrackDto,
  CreateTicketTierDto,
  CreateTrackDto,
  EventStatus,
  ReorderTicketTiersDto,
  UpdateEventDto,
  UpdateSessionDto,
  UpdateStoryDto,
  StoryAnalyticsBatchDto,
  UpdateTicketTierDto,
} from './dto/event.dto';
import type { ZodError } from 'zod';
import {
  STORY_TEMPLATES,
  StoryCompositionSchema,
  hasVisibleTicketsBlock,
} from './story.schema';
import { RegistrationFormSchema } from '../../common/registration-fields';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // omit confusing chars

// Lowercase, URL-clean alphabet for VIP link suffixes. Omits l/o and 0/1 so a
// suffix is safe to read aloud and hard to mistype.
const VIP_SUFFIX_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** A random, URL-safe suffix for a VIP link token. */
function vipSuffix(len: number): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += VIP_SUFFIX_ALPHABET.charAt((bytes[i] ?? 0) % VIP_SUFFIX_ALPHABET.length);
  }
  return out;
}

/**
 * Turn an organizer-typed word into a URL-clean slug: lowercase, spaces and
 * punctuation collapsed to single hyphens, trimmed, capped. Returns '' when
 * nothing usable is left, in which case the caller falls back to a random link.
 */
function slugifyVipLabel(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}
const SAFE_STATUS: EventStatus[] = ['draft', 'published', 'live', 'ended', 'archived'];

// Secret for signing Story Mode preview tokens. A dedicated env is preferred;
// we fall back to the (always-present, high-entropy) JWT private key so no new
// secret has to be provisioned. Tokens are short-lived (24h) so coupling to the
// signing key's lifecycle is acceptable.
const STORY_PREVIEW_SECRET =
  process.env.STORY_PREVIEW_SECRET || process.env.JWT_PRIVATE_KEY || 'orkora-dev-preview-secret';
const STORY_PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------- Public reads --------

  async findPublicByCode(code: string, preview?: string) {
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
        category: true,
        city: true,
        storyBlocks: true,
        storyTemplate: true,
        storyPublishedAt: true,
        registrationFields: true,
        registrationIntroHidden: true,
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
    if (!event) throw new NotFoundException('Event not found');
    const authorized = preview ? this.verifyPreviewToken(preview) === event.id : false;
    const hidden = event.status === 'draft' || event.status === 'archived';
    if (event.organization.status === 'suspended' || (hidden && !authorized)) {
      throw new NotFoundException('Event not found');
    }
    return { ...this.serializeEvent(event), storyPreview: authorized };
  }

  async findPublicBySlug(orgSlug: string, eventSlug: string, preview?: string) {
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
        category: true,
        city: true,
        storyBlocks: true,
        storyTemplate: true,
        storyPublishedAt: true,
        registrationFields: true,
        registrationIntroHidden: true,
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
    if (!event) throw new NotFoundException('Event not found');
    const authorized = preview ? this.verifyPreviewToken(preview) === event.id : false;
    const hidden = event.status === 'draft' || event.status === 'archived';
    if (event.organization.status === 'suspended' || (hidden && !authorized)) {
      throw new NotFoundException('Event not found');
    }
    return { ...this.serializeEvent(event), storyPreview: authorized };
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

  // -------- Public discovery (browse by category / city) --------

  /**
   * Public browse of upcoming, published events, optionally filtered by topic
   * category or city. Powers the SEO category/city pages. Excludes drafts,
   * archived events, and suspended orgs. This is groundwork, not a marketplace
   * hub - the pages fill in automatically as events accrue.
   */
  async browsePublicEvents(opts: { category?: string; city?: string; take?: number; skip?: number }) {
    const take = Math.min(Math.max(opts.take ?? 24, 1), 48);
    const skip = Math.max(opts.skip ?? 0, 0);
    const where: Prisma.EventWhereInput = {
      status: { in: ['published', 'live', 'ended'] },
      organization: { status: { not: 'suspended' } },
      endAt: { gte: new Date() },
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.city ? { city: { equals: opts.city, mode: 'insensitive' } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        orderBy: { startAt: 'asc' },
        take,
        skip,
        select: {
          code: true,
          slug: true,
          title: true,
          kind: true,
          startAt: true,
          endAt: true,
          timezone: true,
          bannerUrl: true,
          category: true,
          city: true,
          organization: { select: { name: true, slug: true, brandColor: true } },
        },
      }),
    ]);
    return {
      total,
      take,
      skip,
      events: rows.map((e) => ({
        code: e.code,
        slug: e.slug,
        title: e.title,
        kind: e.kind,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        timezone: e.timezone,
        bannerUrl: e.bannerUrl,
        category: e.category,
        city: e.city,
        organization: e.organization,
      })),
    };
  }

  /** Distinct categories and cities that have upcoming public events, with counts. */
  async getDiscoverFacets() {
    const base: Prisma.EventWhereInput = {
      status: { in: ['published', 'live', 'ended'] },
      organization: { status: { not: 'suspended' } },
      endAt: { gte: new Date() },
    };
    const [byCategory, byCity] = await Promise.all([
      this.prisma.event.groupBy({
        by: ['category'],
        where: { ...base, category: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.event.groupBy({
        by: ['city'],
        where: { ...base, city: { not: null } },
        _count: { _all: true },
      }),
    ]);
    return {
      categories: byCategory
        .filter((c) => c.category)
        .map((c) => ({ slug: c.category as string, count: c._count._all }))
        .sort((a, b) => b.count - a.count),
      cities: byCity
        .filter((c) => c.city)
        .map((c) => ({ city: c.city as string, count: c._count._all }))
        .sort((a, b) => b.count - a.count),
    };
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
        category: dto.category ?? null,
        city: dto.city ?? null,
        registrationFields: this.validateRegistrationFields(dto.registrationFields),
        registrationIntroHidden: dto.registrationIntroHidden ?? undefined,
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
        category: true,
        city: true,
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
        // Distinguish "absent" (no change) from explicit null (clear the value),
        // so organizers can remove a category/city, not only set it.
        category: dto.category === undefined ? undefined : dto.category,
        city: dto.city === undefined ? undefined : dto.city,
        registrationFields: this.validateRegistrationFields(dto.registrationFields),
        registrationIntroHidden:
          dto.registrationIntroHidden === undefined ? undefined : dto.registrationIntroHidden,
      },
    });
    return this.serializeEvent(event);
  }

  // -------- Story Mode --------

  /**
   * Save an event's Story Mode composition (blocks + optional template). The
   * one hard rule: a visible tickets block must exist, because "every event
   * page needs a way to buy tickets" (D2). Deep block shape is validated by the
   * composition schema; per-block data is stored as-is and read defensively by
   * the renderer.
   */
  async updateStory(orgId: string, eventId: string, dto: UpdateStoryDto) {
    const existing = await this.assertEventInOrg(orgId, eventId);

    const parsed = StoryCompositionSchema.safeParse(dto.blocks);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid story composition',
        errors: describeStoryIssues(parsed.error),
      });
    }
    if (!hasVisibleTicketsBlock(parsed.data)) {
      throw new BadRequestException('Every event page needs a way to buy tickets.');
    }

    const template =
      dto.template && (STORY_TEMPLATES as readonly string[]).includes(dto.template)
        ? dto.template
        : existing.storyTemplate;

    return this.serializeEvent(
      await this.prisma.event.update({
        where: { id: eventId },
        data: {
          storyBlocks: parsed.data as unknown as Prisma.InputJsonValue,
          storyTemplate: template,
        },
      }),
    );
  }

  /** Flip the event to the Story Mode renderer. Requires a valid composition. */
  async publishStory(orgId: string, eventId: string) {
    const existing = await this.assertEventInOrg(orgId, eventId);
    const parsed = StoryCompositionSchema.safeParse(existing.storyBlocks);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'The saved story composition is malformed and cannot be published.',
        errors: describeStoryIssues(parsed.error),
      });
    }
    if (!hasVisibleTicketsBlock(parsed.data)) {
      throw new BadRequestException('Compose a story with a tickets block before publishing.');
    }
    return this.serializeEvent(
      await this.prisma.event.update({
        where: { id: eventId },
        data: { storyPublishedAt: new Date() },
      }),
    );
  }

  /** Revert to the classic layout without discarding the composition. */
  async unpublishStory(orgId: string, eventId: string) {
    await this.assertEventInOrg(orgId, eventId);
    return this.serializeEvent(
      await this.prisma.event.update({
        where: { id: eventId },
        data: { storyPublishedAt: null },
      }),
    );
  }

  /**
   * Ingest a batch of Story Mode engagement events from the public renderer.
   * Public + unauthenticated, so it is defensive: unknown/suspended events are
   * silently dropped, the batch is capped, and no error is surfaced to the
   * page (analytics must never break the reader's experience).
   */
  async recordStoryAnalytics(code: string, dto: StoryAnalyticsBatchDto) {
    const event = await this.prisma.event.findUnique({
      where: { code: code.toUpperCase() },
      select: { id: true, organization: { select: { status: true } } },
    });
    if (!event || event.organization.status === 'suspended') {
      return { ok: true };
    }
    const visitor = dto.visitor ? dto.visitor.slice(0, 64) : null;
    const rows = (dto.events ?? []).slice(0, 50).map((e) => ({
      eventId: event.id,
      kind: e.kind,
      blockType: e.blockType ?? null,
      blockIndex: e.blockIndex ?? null,
      depthPercent: e.depthPercent ?? null,
      visitor,
    }));
    if (rows.length > 0) {
      await this.prisma.storyAnalytics.createMany({ data: rows });
    }
    return { ok: true };
  }

  /** Aggregated Story Mode engagement for the organiser dashboard. */
  async getStoryAnalytics(orgId: string, eventId: string) {
    await this.assertEventInOrg(orgId, eventId);
    const [views, ticketsReached, byBlock, byDepth] = await Promise.all([
      this.prisma.storyAnalytics.count({ where: { eventId, kind: 'event_view' } }),
      this.prisma.storyAnalytics.count({ where: { eventId, kind: 'tickets_scrolled_to' } }),
      this.prisma.storyAnalytics.groupBy({
        by: ['blockType'],
        where: { eventId, kind: 'block_viewed' },
        _count: { _all: true },
      }),
      this.prisma.storyAnalytics.groupBy({
        by: ['depthPercent'],
        where: { eventId, kind: 'scroll_depth' },
        _count: { _all: true },
      }),
    ]);
    return {
      views,
      ticketsReached,
      blocks: byBlock
        .map((b) => ({ blockType: b.blockType ?? 'unknown', impressions: b._count._all }))
        .sort((a, b) => b.impressions - a.impressions),
      scrollDepth: byDepth
        .filter((d) => d.depthPercent !== null)
        .map((d) => ({ depthPercent: d.depthPercent as number, count: d._count._all }))
        .sort((a, b) => a.depthPercent - b.depthPercent),
    };
  }

  /**
   * Mint a signed, 24h preview token so an organiser can share an unpublished
   * Story Mode draft. The token binds to the event id; the public read honours
   * it to render the draft even when it is not published.
   */
  async createStoryPreviewToken(orgId: string, eventId: string) {
    await this.assertEventInOrg(orgId, eventId);
    const expMs = Date.now() + STORY_PREVIEW_TTL_MS;
    return {
      token: this.signPreviewToken(eventId, expMs),
      expiresAt: new Date(expMs).toISOString(),
    };
  }

  // -------- VIP express link --------

  /**
   * Generate (or return the existing) VIP express link token for an event.
   *
   * One shared secret link per event. The token is the secret that guards the
   * link, and it becomes the last path segment of a compact URL
   * (`/e/<code>/vip/<token>`). Anyone holding the link can register with name
   * and email only, skipping the event's custom questions.
   *
   * Shapes:
   *   - With a `label` (a custom word the organizer typed), the token is that
   *     word slugified plus a short random suffix, e.g. `goldclass-7kd9qs`. The
   *     suffix keeps the link hard to guess even though the word is memorable.
   *   - Without a label, the token is a compact random string.
   *
   * Idempotency: with no label and no `regenerate`, an existing token is
   * returned unchanged. Supplying a label, or `regenerate: true`, mints a fresh
   * token and retires the old link immediately.
   */
  async generateVipLink(
    orgId: string,
    eventId: string,
    regenerate = false,
    label?: string,
  ) {
    const event = await this.assertEventInOrg(orgId, eventId);
    const slug = label ? slugifyVipLabel(label) : '';
    const shouldCreate = !event.vipToken || regenerate || !!slug;
    if (!shouldCreate) {
      return { token: event.vipToken, code: event.code };
    }

    // Retry a few times so a rare suffix collision (vip_token is globally
    // unique) does not surface as a 500.
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = slug
        ? `${slug}-${vipSuffix(6)}`
        : vipSuffix(12);
      try {
        await this.prisma.event.update({
          where: { id: eventId },
          data: { vipToken: token },
        });
        return { token, code: event.code };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new BadRequestException('Could not generate a unique VIP link. Please try again.');
  }

  /**
   * Remove an event's VIP link, so any shared link stops working.
   */
  async revokeVipLink(orgId: string, eventId: string) {
    await this.assertEventInOrg(orgId, eventId);
    await this.prisma.event.update({
      where: { id: eventId },
      data: { vipToken: null },
    });
    return { token: null };
  }

  /**
   * Public: validate a VIP link (code + token) and return the minimal event
   * context the express page needs to render. Never echoes the token, custom
   * questions, or anything a normal public read would not already expose. A
   * missing or mismatched token is a 404, so a wrong link is indistinguishable
   * from a non-existent one.
   */
  async findVipContext(code: string, token: string | undefined) {
    if (!token) throw new NotFoundException('VIP link not found');
    const event = await this.prisma.event.findUnique({
      where: { code },
      select: {
        vipToken: true,
        title: true,
        code: true,
        startAt: true,
        endAt: true,
        timezone: true,
        bannerUrl: true,
        status: true,
        organization: {
          select: { name: true, slug: true, brandColor: true, logoUrl: true, status: true },
        },
      },
    });
    if (!event || !event.vipToken) throw new NotFoundException('VIP link not found');
    // Constant-time compare so a wrong token cannot be probed byte by byte.
    const a = Buffer.from(event.vipToken);
    const b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new NotFoundException('VIP link not found');
    }
    if (event.status !== 'published' || event.organization.status === 'suspended') {
      throw new BadRequestException('This event is not open for registration');
    }
    return {
      title: event.title,
      code: event.code,
      startAt: event.startAt.toISOString(),
      endAt: event.endAt.toISOString(),
      timezone: event.timezone,
      bannerUrl: event.bannerUrl,
      organization: {
        name: event.organization.name,
        slug: event.organization.slug,
        brandColor: event.organization.brandColor,
        logoUrl: event.organization.logoUrl,
      },
    };
  }

  private signPreviewToken(eventId: string, expMs: number): string {
    const payload = `${eventId}.${expMs}`;
    const sig = createHmac('sha256', STORY_PREVIEW_SECRET).update(payload).digest('base64url');
    return `${Buffer.from(payload).toString('base64url')}.${sig}`;
  }

  /** Returns the event id a preview token authorizes, or null if invalid/expired. */
  private verifyPreviewToken(token: string): string | null {
    try {
      const [pB64, sig] = token.split('.');
      if (!pB64 || !sig) return null;
      const payload = Buffer.from(pB64, 'base64url').toString('utf8');
      const expected = createHmac('sha256', STORY_PREVIEW_SECRET).update(payload).digest();
      const given = Buffer.from(sig, 'base64url');
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      const dot = payload.lastIndexOf('.');
      const eventId = payload.slice(0, dot);
      const expMs = Number(payload.slice(dot + 1));
      if (!eventId || !Number.isFinite(expMs) || Date.now() > expMs) return null;
      return eventId;
    } catch {
      return null;
    }
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

  async updateTrack(
    orgId: string,
    eventId: string,
    trackId: string,
    dto: UpdateTrackDto,
  ) {
    await this.assertEventInOrg(orgId, eventId);
    const track = await this.prisma.track.findFirst({ where: { id: trackId, eventId } });
    if (!track) throw new NotFoundException('Track not found');
    return this.prisma.track.update({
      where: { id: trackId },
      data: { name: dto.name ?? undefined, color: dto.color ?? undefined },
    });
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

  async updateSpeaker(
    orgId: string,
    eventId: string,
    speakerId: string,
    dto: UpdateSpeakerDto,
  ) {
    await this.assertEventInOrg(orgId, eventId);
    const speaker = await this.prisma.speaker.findFirst({
      where: { id: speakerId, eventId },
    });
    if (!speaker) throw new NotFoundException('Speaker not found');
    return this.prisma.speaker.update({
      where: { id: speakerId },
      data: {
        fullName: dto.fullName ?? undefined,
        title: dto.title ?? undefined,
        bio: dto.bio ?? undefined,
        avatarUrl: dto.avatarUrl ?? undefined,
        socialLinks: dto.socialLinks ?? undefined,
      },
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
    // A group tier's minimum block (groupSize) must fit inside the per-order
    // ceiling, otherwise it can never be purchased.
    if (dto.isGroup && dto.groupSize) {
      const maxPer = dto.maxPerOrder ?? 10;
      if (dto.groupSize > maxPer) {
        throw new BadRequestException(
          'Group size must be <= the maximum tickets per order',
        );
      }
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

    // Re-validate the group floor against the effective (post-patch) values.
    const effIsGroup = dto.isGroup ?? existing.isGroup;
    const effGroupSize = dto.groupSize ?? existing.groupSize;
    const effMaxPer = dto.maxPerOrder ?? existing.maxPerOrder;
    if (effIsGroup && effGroupSize && effGroupSize > effMaxPer) {
      throw new BadRequestException(
        'Group size must be <= the maximum tickets per order',
      );
    }

    // A capped quantity cannot be set below what has already been sold, or the
    // remaining-seats maths and the countdown would go negative.
    if (
      dto.quantityTotal !== undefined &&
      dto.quantityTotal !== null &&
      dto.quantityTotal < existing.quantitySold
    ) {
      throw new BadRequestException(
        `Quantity cannot be lower than the ${existing.quantitySold} already sold`,
      );
    }

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

  async deleteTier(orgId: string, eventId: string, tierId: string, force = false) {
    await this.assertEventInOrg(orgId, eventId);
    const tier = await this.prisma.ticketTier.findFirst({
      where: { id: tierId, eventId },
    });
    if (!tier) throw new NotFoundException('Ticket tier not found');

    if (!force) {
      // Refuse cleanly when anything still points at the tier. We check the
      // real dependent rows (tickets and order items), not just the
      // quantitySold counter: an expired or released hold decrements
      // quantitySold back to 0 while leaving cancelled ticket and order-item
      // rows behind, and those rows are what a raw delete trips over. Checking
      // them here turns that database foreign-key error (a 500) into a clear
      // 400 the UI can act on by offering the force delete.
      const [ticketCount, itemCount] = await Promise.all([
        this.prisma.ticket.count({ where: { tierId } }),
        this.prisma.orderItem.count({ where: { tierId } }),
      ]);
      if (tier.quantitySold > 0 || ticketCount > 0 || itemCount > 0) {
        throw new BadRequestException('Cannot delete a tier that has tickets or orders');
      }
      try {
        await this.prisma.ticketTier.delete({ where: { id: tierId } });
      } catch (err) {
        // Safety net: if a row was created between the checks above and the
        // delete, surface the same actionable 400 rather than a 500.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2003'
        ) {
          throw new BadRequestException('Cannot delete a tier that has tickets or orders');
        }
        throw err;
      }
      return { ok: true };
    }

    // Force delete (organizer opted in through a confirm). Meant for clearing a
    // tier created in error or during testing, so it still refuses to destroy
    // anything of real value:
    //   - any order for this tier that is paid or refunded (real money), and
    //   - any ticket on this tier that has been checked in (a real attendance).
    // Everything else on the tier (free tickets, pending or failed holds) is
    // test or abandoned data and is removed with the tier.
    const paidItem = await this.prisma.orderItem.findFirst({
      where: { tierId, order: { status: { in: ['paid', 'refunded'] } } },
      select: { id: true },
    });
    if (paidItem) {
      throw new BadRequestException(
        'This tier has paid orders and cannot be deleted. Refund those orders first.',
      );
    }
    const checkedIn = await this.prisma.ticket.findFirst({
      where: { tierId, checkedInAt: { not: null } },
      select: { id: true },
    });
    if (checkedIn) {
      throw new BadRequestException(
        'This tier has checked-in attendees and cannot be deleted.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Orders that reference this tier, captured before we remove their items.
      const items = await tx.orderItem.findMany({
        where: { tierId },
        select: { orderId: true },
      });
      const orderIds = [...new Set(items.map((i) => i.orderId))];

      // Remove the rows that hold a foreign key to the tier, then the tier.
      await tx.ticket.deleteMany({ where: { tierId } });
      await tx.orderItem.deleteMany({ where: { tierId } });

      // Any pending order left with no items is a phantom hold now; fail it so
      // it does not linger or trip the duplicate-order guard on re-registration.
      for (const orderId of orderIds) {
        const remaining = await tx.orderItem.count({ where: { orderId } });
        if (remaining === 0) {
          await tx.order.updateMany({
            where: { id: orderId, status: 'pending' },
            data: { status: 'failed' },
          });
        }
      }

      await tx.ticketTier.delete({ where: { id: tierId } });
    });
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

  private validateRegistrationFields(input: unknown): Prisma.InputJsonValue | undefined {
    // undefined means "not provided": create falls back to the column default
    // ([]), update leaves the existing value unchanged.
    if (input === undefined) return undefined;
    const parsed = RegistrationFormSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid registration fields',
        errors: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    return parsed.data as unknown as Prisma.InputJsonValue;
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

/**
 * One machine-readable reason a story composition was rejected.
 *
 * `blockIndex` is the position in the blocks array, so a client can highlight
 * the offending card. `field` is the path inside that block ('variant',
 * 'data', 'id'), empty when the whole block is wrong.
 */
export interface StoryCompositionIssue {
  blockIndex: number | null;
  field: string | null;
  code: string;
  detail: string;
}

/**
 * Turn a zod failure on a story composition into something an organiser can act
 * on.
 *
 * Without this the client only ever saw the string "Invalid story composition",
 * which is accurate and useless: the composer autosaves, every save 400s, and
 * nobody can tell which block is malformed. The commonest cause is a null where
 * the schema wants an absent value (`variant: null`, `hidden: null`), which is
 * invisible without the path.
 *
 * Capped at 20 issues so a pathological payload cannot inflate the response.
 */
function describeStoryIssues(error: ZodError): StoryCompositionIssue[] {
  return error.issues.slice(0, 20).map((issue) => ({
    blockIndex: typeof issue.path[0] === 'number' ? issue.path[0] : null,
    field: issue.path.slice(1).join('.') || null,
    code: issue.code,
    detail: issue.message,
  }));
}
