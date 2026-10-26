import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { Role } from '../../common/decorators/roles.decorator';
import { OutboundGuardService, OutboundLimitError } from '../../common/outbound/outbound-guard.service';
import { isPlainEmailAddress } from '../../common/outbound/text-safety';
import { emailCapKey } from '../../common/outbound/ip';

const TTL_DAYS = 14;

// Invite caps (docs/SIGNUP_ABUSE_2026-10.md). A team is a handful of people;
// these stop a throwaway account using invites to mail a list.
const INVITES_PER_ORG_PER_DAY = 30;
const INVITES_PER_USER_PER_DAY = 30;
const INVITES_PER_ADDRESS_PER_DAY = 3;

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly cfg: ConfigService,
    private readonly guard?: OutboundGuardService,
  ) {}

  async create(input: {
    organizationId: string;
    email: string;
    role: Role;
    invitedById: string;
  }) {
    if (input.role === 'owner') {
      throw new BadRequestException('Cannot invite a new owner. Transfer ownership instead.');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const email = input.email.trim().toLowerCase();
    if (!isPlainEmailAddress(email)) throw new BadRequestException('Enter a valid email address.');
    const existingMember = await this.prisma.user.findFirst({
      where: { email, memberships: { some: { organizationId: input.organizationId } } },
    });
    if (existingMember) {
      throw new ConflictException('That email is already a member of this organization');
    }

    // Caps are counted before anything is written, so a refused invite leaves
    // any earlier pending invitation for this address untouched.
    if (this.guard) {
      const ok = await this.guard.allow('invite', [
        { name: 'org', value: input.organizationId, limit: INVITES_PER_ORG_PER_DAY, windowSeconds: 86_400 },
        { name: 'user', value: input.invitedById, limit: INVITES_PER_USER_PER_DAY, windowSeconds: 86_400 },
        { name: 'email', value: emailCapKey(email), limit: INVITES_PER_ADDRESS_PER_DAY, windowSeconds: 86_400 },
      ]);
      if (!ok) {
        throw new OutboundLimitError('Invitation limit reached for today. Please try again tomorrow.');
      }
    }

    // Generate single-use token. The plaintext is mailed; only the hash is stored.
    const tokenPlain = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(tokenPlain);
    const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

    // Replace any existing pending invitation for the same email + org.
    await this.prisma.invitation.deleteMany({
      where: { organizationId: input.organizationId, email, acceptedAt: null },
    });

    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId: input.organizationId,
        email,
        role: input.role,
        invitedById: input.invitedById,
        tokenHash,
        expiresAt,
      },
    });

    const appUrl = this.cfg.getOrThrow<string>('APP_URL');
    const acceptUrl = `${appUrl.replace(/\/$/, '')}/invite/accept?token=${encodeURIComponent(tokenPlain)}`;
    await this.notifications.sendInviteEmail(email, org.name, acceptUrl);

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    };
  }

  async listForOrg(organizationId: string) {
    return this.prisma.invitation.findMany({
      where: { organizationId, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async revoke(organizationId: string, invitationId: string) {
    const inv = await this.prisma.invitation.findFirst({
      where: { id: invitationId, organizationId },
    });
    if (!inv) throw new NotFoundException('Invitation not found');
    if (inv.acceptedAt) throw new BadRequestException('Invitation already accepted');
    await this.prisma.invitation.update({
      where: { id: inv.id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Accept an invitation. The caller must already be authenticated (so we know
   * which user to attach the membership to). The token's email must match the
   * authenticated user's email; otherwise the invitation is for someone else.
   */
  async accept(input: { token: string; userId: string }) {
    const tokenHash = this.hash(input.token);
    const invitation = await this.prisma.invitation.findFirst({
      where: { tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!invitation) throw new UnauthorizedException('Invalid or expired invitation');

    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new UnauthorizedException('This invitation was sent to a different email');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      const membership = await tx.membership.upsert({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: invitation.organizationId,
          },
        },
        create: {
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
        update: { role: invitation.role },
      });
      return {
        organizationId: membership.organizationId,
        role: membership.role,
      };
    });
  }

  private hash(token: string): string {
    const pepper = this.cfg.getOrThrow<string>('REFRESH_TOKEN_PEPPER');
    return createHash('sha256').update(token + pepper).digest('hex');
  }
}
