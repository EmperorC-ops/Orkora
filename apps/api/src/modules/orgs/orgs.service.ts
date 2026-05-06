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
}

const ALLOWED_ROLES = ['owner', 'admin', 'organizer', 'staff', 'vendor'] as const;
type AssignableRole = (typeof ALLOWED_ROLES)[number];

@Injectable()
export class OrgsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, input: CreateOrgInput) {
    return this.prisma.$transaction(async (tx) => {
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
  }

  async findById(id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
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
