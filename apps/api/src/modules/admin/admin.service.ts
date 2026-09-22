import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

export const PLATFORM_ROLES = ['none', 'support', 'superadmin'] as const;
export type PlatformRoleValue = (typeof PLATFORM_ROLES)[number];

/**
 * Platform-console service. Every query here is intentionally cross-org: it is
 * only reachable behind the PlatformGuard (super admin), so it bypasses the
 * per-org filtering the rest of the app applies.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Headline platform metrics for the console overview. */
  async overview() {
    const [
      orgTotal,
      orgSuspended,
      userTotal,
      superAdmins,
      eventTotal,
      eventPublished,
      registrations,
      ticketsIssued,
      paidOrders,
      settlementHolds,
    ] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.organization.count({ where: { status: 'suspended' } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { platformRole: 'superadmin' } }),
      this.prisma.event.count(),
      this.prisma.event.count({ where: { status: 'published' } }),
      this.prisma.registration.count(),
      this.prisma.ticket.count({ where: { status: { in: ['issued', 'checked_in'] } } }),
      this.prisma.order.findMany({
        where: { status: 'paid' },
        select: { totalMinor: true, currency: true },
      }),
      // Orders quarantined by the settlement amount check. Money is with the
      // provider and no automated path will move it, so this number must be
      // visible on the console landing page, not only in Sentry.
      this.prisma.order.count({ where: { settlementHoldAt: { not: null } } }),
    ]);

    const revenueByCurrency: Record<string, number> = {};
    for (const o of paidOrders) {
      revenueByCurrency[o.currency] =
        (revenueByCurrency[o.currency] ?? 0) + Number(o.totalMinor);
    }

    return {
      organizations: { total: orgTotal, suspended: orgSuspended, active: orgTotal - orgSuspended },
      users: { total: userTotal, superAdmins },
      events: { total: eventTotal, published: eventPublished },
      registrations,
      ticketsIssued,
      paidOrders: paidOrders.length,
      revenueByCurrency,
      settlementHolds,
    };
  }

  /**
   * Orders quarantined by the settlement amount check: the provider reported a
   * successful capture whose amount or currency did not match the order, so no
   * ticket was issued and no automated path will touch it again.
   *
   * Cross-org by design, like everything else on this console. Newest first,
   * because a fresh hold is the one where the buyer is still waiting.
   */
  async listSettlementHolds(opts: { take?: number; skip?: number } = {}) {
    const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
    const skip = Math.max(opts.skip ?? 0, 0);
    const where: Prisma.OrderWhereInput = { settlementHoldAt: { not: null } };

    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { settlementHoldAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          status: true,
          provider: true,
          providerRef: true,
          totalMinor: true,
          currency: true,
          createdAt: true,
          settlementHoldAt: true,
          settlementHoldReason: true,
          settlementHoldDetail: true,
          user: { select: { id: true, email: true } },
          event: {
            select: {
              id: true,
              title: true,
              organizationId: true,
              organization: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return {
      total,
      take,
      skip,
      rows: rows.map((o) => ({
        id: o.id,
        status: o.status,
        provider: o.provider,
        providerRef: o.providerRef,
        // Serialised: BigInt does not survive JSON, and the console needs the
        // exact figure to compare against the provider dashboard.
        expectedAmountMinor: o.totalMinor.toString(),
        currency: o.currency,
        createdAt: o.createdAt.toISOString(),
        heldAt: o.settlementHoldAt?.toISOString() ?? null,
        reason: o.settlementHoldReason,
        detail: o.settlementHoldDetail,
        buyer: { id: o.user.id, email: o.user.email },
        event: {
          id: o.event.id,
          title: o.event.title,
          organizationId: o.event.organizationId,
          organizationName: o.event.organization.name,
        },
      })),
    };
  }

  async listOrganizations(query: { q?: string; take?: number; skip?: number }) {
    const take = Math.min(Math.max(query.take ?? 50, 1), 200);
    const skip = Math.max(query.skip ?? 0, 0);
    const where: Prisma.OrganizationWhereInput = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { slug: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          plan: true,
          countryCode: true,
          createdAt: true,
          _count: { select: { events: true, memberships: true } },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    return {
      total,
      take,
      skip,
      rows: rows.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        status: o.status,
        plan: o.plan,
        countryCode: o.countryCode,
        createdAt: o.createdAt.toISOString(),
        eventCount: o._count.events,
        memberCount: o._count.memberships,
      })),
    };
  }

  async setOrganizationStatus(orgId: string, status: 'active' | 'suspended') {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { status },
    });
    return { id: updated.id, status: updated.status };
  }

  async listUsers(query: { q?: string; take?: number; skip?: number }) {
    const take = Math.min(Math.max(query.take ?? 50, 1), 200);
    const skip = Math.max(query.skip ?? 0, 0);
    const where: Prisma.UserWhereInput = query.q
      ? {
          OR: [
            { email: { contains: query.q, mode: 'insensitive' } },
            { fullName: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          email: true,
          fullName: true,
          platformRole: true,
          createdAt: true,
          lastLoginAt: true,
          _count: { select: { memberships: true, registrations: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      total,
      take,
      skip,
      rows: rows.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        platformRole: u.platformRole,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        membershipCount: u._count.memberships,
        registrationCount: u._count.registrations,
      })),
    };
  }

  /**
   * Promote/demote a user's platform role. Guard-railed so the last super admin
   * cannot be demoted (which would lock everyone out of the console).
   */
  async setPlatformRole(userId: string, role: PlatformRoleValue) {
    if (!PLATFORM_ROLES.includes(role)) {
      throw new BadRequestException(`Unknown platform role: ${role}`);
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.platformRole === 'superadmin' && role !== 'superadmin') {
      const superAdmins = await this.prisma.user.count({
        where: { platformRole: 'superadmin' },
      });
      if (superAdmins <= 1) {
        throw new BadRequestException('Cannot demote the last super admin');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { platformRole: role },
    });
    return { id: updated.id, platformRole: updated.platformRole };
  }

  async listEvents(query: { q?: string; status?: string; take?: number; skip?: number }) {
    const take = Math.min(Math.max(query.take ?? 50, 1), 200);
    const skip = Math.max(query.skip ?? 0, 0);
    const where: Prisma.EventWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) where.title = { contains: query.q, mode: 'insensitive' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          code: true,
          title: true,
          slug: true,
          status: true,
          startAt: true,
          timezone: true,
          createdAt: true,
          organization: { select: { id: true, name: true, slug: true } },
          _count: { select: { registrations: true } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      total,
      take,
      skip,
      rows: rows.map((e) => ({
        id: e.id,
        code: e.code,
        title: e.title,
        slug: e.slug,
        status: e.status,
        startAt: e.startAt.toISOString(),
        timezone: e.timezone,
        createdAt: e.createdAt.toISOString(),
        organization: e.organization,
        registrationCount: e._count.registrations,
      })),
    };
  }
}
