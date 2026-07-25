import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface CreateOrgInput {
  name: string;
  slug: string;
  countryCode?: string;
}

interface UpdateOrgInput {
  name?: string;
  slug?: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  countryCode?: string;
  // Brand Home composer fields.
  tagline?: string | null;
  heroVariant?: string;
  heroMediaUrl?: string | null;
  heroMediaType?: string | null;
  heroBio?: string | null;
  brandAccent?: string | null;
  brandSurface?: string | null;
  socials?: Record<string, string>;
}

// Channels we render on the Brand Home SocialsBar. Anything else is dropped.
const SOCIAL_KEYS = ['instagram', 'tiktok', 'x', 'whatsapp'] as const;

function sanitizeSocials(input: Record<string, unknown> | undefined): Record<string, string> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, string> = {};
  for (const key of SOCIAL_KEYS) {
    const value = input[key];
    if (typeof value === 'string') {
      const url = value.trim();
      if (url && /^https?:\/\//i.test(url) && url.length <= 300) out[key] = url;
    }
  }
  return out;
}

const ALLOWED_ROLES = ['owner', 'admin', 'organizer', 'staff', 'vendor'] as const;
type AssignableRole = (typeof ALLOWED_ROLES)[number];

/**
 * Type guard around Prisma's PrismaClientKnownRequestError. We inspect by
 * `code` and the violated `target` field so we don't accidentally hide
 * other unique-constraint races (e.g. a different column).
 */
function isUniqueConstraintError(err: unknown, field: string): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; meta?: { target?: unknown } };
  if (e.code !== 'P2002') return false;
  const target = e.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === 'string') return target.includes(field);
  return true;
}

@Injectable()
export class OrgsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, input: CreateOrgInput) {
    // Cheap pre-flight: if a row with this slug already exists and the
    // caller is already an owner of it, return that row instead of trying
    // a doomed insert. This handles the "client retried after a network
    // wobble" case without surfacing a confusing duplicate-slug error.
    const existing = await this.prisma.organization.findUnique({
      where: { slug: input.slug },
      include: { memberships: { where: { userId, role: 'owner' }, take: 1 } },
    });
    if (existing && existing.memberships.length > 0) {
      // Strip the `memberships` join we used for the ownership probe.
      const { memberships: _omit, ...org } = existing;
      void _omit;
      return org;
    }
    if (existing) {
      throw new BadRequestException(
        'That slug is already taken. Try a different one.',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: input.name,
            slug: input.slug,
            countryCode: input.countryCode ?? 'NG',
          },
        });
        await tx.membership.create({
          data: {
            userId,
            organizationId: org.id,
            role: 'owner',
          },
        });
        return org;
      });
    } catch (err) {
      // Race-safety: the slug check above can lose to a concurrent insert.
      // Prisma raises P2002 for unique-constraint violations, which we
      // convert to a 400 instead of letting it surface as a 500.
      if (isUniqueConstraintError(err, 'slug')) {
        throw new BadRequestException(
          'That slug is already taken. Try a different one.',
        );
      }
      throw err;
    }
  }

  async findById(id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  /**
   * Public "Brand Home" payload: the brand's identity plus its publishable
   * events, split into upcoming (still to come or in progress) and past. Draft
   * and archived events are never exposed, and a suspended org is hidden. No
   * auth: this powers the public /o/<slug> page.
   */
  async getPublicBrand(slug: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        brandColor: true,
        tagline: true,
        heroVariant: true,
        heroMediaUrl: true,
        heroMediaType: true,
        heroBio: true,
        brandAccent: true,
        brandSurface: true,
        socials: true,
        status: true,
      },
    });
    if (!org || org.status === 'suspended') {
      throw new NotFoundException('Brand not found');
    }

    const events = await this.prisma.event.findMany({
      where: {
        organizationId: org.id,
        status: { in: ['published', 'live', 'ended'] },
      },
      select: {
        id: true,
        title: true,
        code: true,
        slug: true,
        kind: true,
        startAt: true,
        endAt: true,
        timezone: true,
        bannerUrl: true,
        status: true,
      },
      orderBy: { startAt: 'asc' },
    });

    const now = new Date();
    const shape = (e: (typeof events)[number]) => ({
      title: e.title,
      code: e.code,
      slug: e.slug,
      kind: e.kind,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
      timezone: e.timezone,
      bannerUrl: e.bannerUrl,
      status: e.status,
    });
    // Upcoming = not finished yet (includes live). Past = finished, newest first.
    const upcoming = events.filter((e) => e.endAt >= now).map(shape);
    const past = events
      .filter((e) => e.endAt < now)
      .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
      .map(shape);

    return {
      name: org.name,
      slug: org.slug,
      logoUrl: org.logoUrl,
      brandColor: org.brandColor,
      tagline: org.tagline,
      heroVariant: org.heroVariant,
      heroMediaUrl: org.heroMediaUrl,
      heroMediaType: org.heroMediaType,
      heroBio: org.heroBio,
      brandAccent: org.brandAccent,
      brandSurface: org.brandSurface,
      socials: sanitizeSocials(org.socials as Record<string, unknown> | undefined),
      upcoming,
      past,
    };
  }

  /**
   * Community subscribe from the public Brand Home. Idempotent per (org, email):
   * a repeat submission is a no-op success so we never leak whether an email is
   * already on the list. Rejected for suspended/unknown brands.
   */
  async subscribeToBrand(slug: string, rawEmail: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });
    if (!org || org.status === 'suspended') {
      throw new NotFoundException('Brand not found');
    }
    const email = (rawEmail ?? '').trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('Enter a valid email address.');
    }
    try {
      await this.prisma.brandSubscriber.create({
        data: { organizationId: org.id, email },
      });
    } catch {
      // Unique-violation (already subscribed) or transient: treat as success so
      // the form does not reveal membership and stays friendly.
    }
    return { status: 'subscribed' as const };
  }

  /**
   * Organizer view of the brand audience: total count plus the most recent
   * subscribers. Tenancy is the caller's org (enforced by RolesGuard on the
   * route via the orgId param).
   */
  async listBrandSubscribers(orgId: string, take = 100) {
    const [total, recent] = await Promise.all([
      this.prisma.brandSubscriber.count({ where: { organizationId: orgId } }),
      this.prisma.brandSubscriber.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(take, 1), 500),
        select: { email: true, createdAt: true },
      }),
    ]);
    return {
      total,
      recent: recent.map((s) => ({ email: s.email, createdAt: s.createdAt.toISOString() })),
    };
  }

  /**
   * Ingest a brand-level engagement event from a public surface (Brand Home
   * view, Shareable Card generated/viewed/downloaded). Public + unauthenticated,
   * so it is defensive: unknown/suspended orgs are silently dropped, the kind is
   * validated, and free-text fields are length-capped. Never throws to the
   * caller - analytics must not break the page.
   */
  async recordBrandAnalytics(
    slug: string,
    input: { kind: string; source?: string | null; visitor?: string | null },
  ) {
    const allowed = new Set([
      'brand_home.viewed',
      'shareable_card.generated',
      'shareable_card.viewed',
      'shareable_card.downloaded',
    ]);
    if (!allowed.has(input.kind)) return { ok: true };
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });
    if (!org || org.status === 'suspended') return { ok: true };
    await this.prisma.brandAnalytics.create({
      data: {
        organizationId: org.id,
        kind: input.kind,
        source: input.source ? input.source.slice(0, 120) : null,
        visitor: input.visitor ? input.visitor.slice(0, 64) : null,
      },
    });
    return { ok: true };
  }

  /**
   * Public sitemap source: every discoverable Brand Home and published event.
   * Excludes suspended orgs and draft/archived events. Consumed by the web
   * app's sitemap.xml route.
   */
  async getSitemap() {
    const [orgs, events] = await Promise.all([
      this.prisma.organization.findMany({
        where: { status: { not: 'suspended' } },
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.event.findMany({
        where: {
          status: { in: ['published', 'live', 'ended'] },
          organization: { status: { not: 'suspended' } },
        },
        select: { code: true, updatedAt: true },
      }),
    ]);
    return {
      orgs: orgs.map((o) => ({ slug: o.slug, updatedAt: o.updatedAt.toISOString() })),
      events: events.map((e) => ({ code: e.code, updatedAt: e.updatedAt.toISOString() })),
    };
  }

  /** Aggregated brand engagement for the organiser dashboard. */
  async getBrandAnalytics(orgId: string) {
    const [byKind, bySource] = await Promise.all([
      this.prisma.brandAnalytics.groupBy({
        by: ['kind'],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
      this.prisma.brandAnalytics.groupBy({
        by: ['source'],
        where: { organizationId: orgId, kind: 'brand_home.viewed' },
        _count: { _all: true },
      }),
    ]);
    const count = (kind: string) =>
      byKind.find((k) => k.kind === kind)?._count._all ?? 0;
    return {
      brandHomeViews: count('brand_home.viewed'),
      cardGenerated: count('shareable_card.generated'),
      cardViewed: count('shareable_card.viewed'),
      cardDownloaded: count('shareable_card.downloaded'),
      topSources: bySource
        .map((s) => ({ source: s.source ?? 'direct', count: s._count._all }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    };
  }

  async update(
    orgId: string,
    actorUserId: string,
    input: UpdateOrgInput,
    requestId?: string,
  ) {
    const before = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!before) throw new NotFoundException('Organization not found');

    if (input.slug && input.slug !== before.slug) {
      const conflict = await this.prisma.organization.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (conflict && conflict.id !== orgId) {
        throw new BadRequestException('Slug already taken');
      }
    }

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.brandColor !== undefined ? { brandColor: input.brandColor } : {}),
        ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
        ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
        ...(input.heroVariant !== undefined ? { heroVariant: input.heroVariant } : {}),
        ...(input.heroMediaUrl !== undefined ? { heroMediaUrl: input.heroMediaUrl } : {}),
        ...(input.heroMediaType !== undefined ? { heroMediaType: input.heroMediaType } : {}),
        ...(input.heroBio !== undefined ? { heroBio: input.heroBio } : {}),
        ...(input.brandAccent !== undefined ? { brandAccent: input.brandAccent } : {}),
        ...(input.brandSurface !== undefined ? { brandSurface: input.brandSurface } : {}),
        ...(input.socials !== undefined ? { socials: sanitizeSocials(input.socials) } : {}),
      },
    });

    await this.audit.record({
      organizationId: orgId,
      actorUserId,
      action: 'organization.updated',
      resourceType: 'organization',
      resourceId: orgId,
      metadata: {
        before: {
          name: before.name,
          slug: before.slug,
          logoUrl: before.logoUrl,
          brandColor: before.brandColor,
          countryCode: before.countryCode,
        },
        after: input,
      },
      requestId,
    });

    return updated;
  }

  /**
   * List members of an org with their role + the user record they map to.
   * Sorted by role weight then name. Used by `/dashboard/settings`.
   */
  async listMembers(orgId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            createdAt: true,
            lastLoginAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const weight: Record<string, number> = {
      owner: 0,
      admin: 1,
      organizer: 2,
      staff: 3,
      vendor: 4,
    };
    return memberships
      .map((m) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
        user: {
          ...m.user,
          createdAt: m.user.createdAt.toISOString(),
          lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
        },
      }))
      .sort((a, b) => {
        const ra = weight[a.role] ?? 99;
        const rb = weight[b.role] ?? 99;
        if (ra !== rb) return ra - rb;
        return a.user.fullName.localeCompare(b.user.fullName);
      });
  }

  /**
   * Update a member's role. Only an owner can promote/demote, and the last
   * remaining owner cannot be demoted (we'd lock the org out of itself).
   */
  async updateMemberRole(
    orgId: string,
    actorUserId: string,
    targetUserId: string,
    role: string,
    requestId?: string,
  ) {
    if (!ALLOWED_ROLES.includes(role as AssignableRole)) {
      throw new BadRequestException(`Unknown role: ${role}`);
    }
    const target = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
    });
    if (!target) throw new NotFoundException('Member not found');

    if (target.role === 'owner' && role !== 'owner') {
      const ownerCount = await this.prisma.membership.count({
        where: { organizationId: orgId, role: 'owner' },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot demote the last owner');
      }
    }

    const updated = await this.prisma.membership.update({
      where: { id: target.id },
      data: { role },
    });

    await this.audit.record({
      organizationId: orgId,
      actorUserId,
      action: 'membership.role_changed',
      resourceType: 'membership',
      resourceId: target.id,
      metadata: { targetUserId, from: target.role, to: role },
      requestId,
    });

    return updated;
  }

  async removeMember(
    orgId: string,
    actorUserId: string,
    targetUserId: string,
    requestId?: string,
  ) {
    const target = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
    });
    if (!target) throw new NotFoundException('Member not found');

    if (target.role === 'owner') {
      const ownerCount = await this.prisma.membership.count({
        where: { organizationId: orgId, role: 'owner' },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot remove the last owner');
      }
    }
    if (target.userId === actorUserId) {
      throw new ForbiddenException('Use a different account to remove yourself');
    }

    await this.prisma.membership.delete({ where: { id: target.id } });

    await this.audit.record({
      organizationId: orgId,
      actorUserId,
      action: 'membership.removed',
      resourceType: 'membership',
      resourceId: target.id,
      metadata: { targetUserId, role: target.role },
      requestId,
    });
  }
}
