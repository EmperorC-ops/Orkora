import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { SocialLoginDto } from './dto/social.dto';
import { GoogleVerifier, AppleVerifier, type SocialIdentity } from './verifiers/social';

interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly google: GoogleVerifier,
    private readonly apple: AppleVerifier,
  ) {}

  async signup(dto: SignupDto): Promise<TokenBundle> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone,
        passwordHash,
      },
    });
    return this.issueTokens(user.id, user.email);
  }

  /**
   * Magic-link / OTP-based passwordless sign-in. Trusts that the OTP service
   * has just verified the destination email. Creates the user if missing
   * (mirrors `social()` for ergonomics) so attendees who registered without
   * ever signing in can authenticate by email and reach `/me/tickets`.
   */
  async loginWithVerifiedEmail(email: string): Promise<TokenBundle> {
    const normalized = email.trim().toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: normalized,
          fullName: normalized.split('@')[0] ?? normalized,
          emailVerified: true,
          locale: 'en-NG',
        },
      });
    } else if (!user.emailVerified) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, lastLoginAt: new Date() },
      });
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }
    return this.issueTokens(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<TokenBundle> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user.id, user.email);
  }

  /**
   * Verifies a Google or Apple ID token and either finds or creates the user
   * by email. We do not store provider subjects in a separate table yet; users
   * are matched by verified email. A future migration can add `social_accounts`
   * to support multiple providers per user without losing this entry path.
   */
  async social(dto: SocialLoginDto): Promise<TokenBundle> {
    const identity: SocialIdentity =
      dto.provider === 'google'
        ? await this.google.verify(dto.idToken)
        : await this.apple.verify(dto.idToken);

    if (!identity.emailVerified) {
      throw new UnauthorizedException('Provider email is not verified');
    }

    let user = await this.prisma.user.findUnique({ where: { email: identity.email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: identity.email,
          fullName: identity.fullName ?? identity.email.split('@')[0] ?? identity.email,
          avatarUrl: identity.avatarUrl,
          emailVerified: true,
        },
      });
    } else if (!user.emailVerified || (identity.avatarUrl && !user.avatarUrl)) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          avatarUrl: user.avatarUrl ?? identity.avatarUrl,
          lastLoginAt: new Date(),
        },
      });
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    return this.issueTokens(user.id, user.email);
  }

  async refresh(refreshToken: string): Promise<TokenBundle> {
    const hash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!stored) {
      // Reuse detection: a token hash we know but that is already revoked
      // (rotated out or logged out) being presented again is the signature of a
      // stolen refresh token. We cannot tell the attacker from the victim, so we
      // revoke the user's whole token family, forcing every session to
      // re-authenticate. A hash we have never seen is just an invalid token.
      const seen = await this.prisma.refreshToken.findFirst({
        where: { tokenHash: hash },
        select: { userId: true },
      });
      if (seen) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: seen.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotate: revoke the presented token, issue a new pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(stored.user.id, stored.user.email);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(userId: string, email: string): Promise<TokenBundle> {
    const [account, memberships] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { platformRole: true },
      }),
      this.prisma.membership.findMany({
        where: { userId },
        select: { organizationId: true, role: true },
      }),
    ]);

    const accessToken = await this.jwt.signAsync({
      sub: userId,
      email,
      platformRole: account?.platformRole ?? 'none',
      memberships: memberships.map((m) => ({ orgId: m.organizationId, role: m.role })),
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = 30;
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
    };
  }

  private hashToken(token: string): string {
    const pepper = this.cfg.getOrThrow<string>('REFRESH_TOKEN_PEPPER');
    return createHash('sha256').update(token + pepper).digest('hex');
  }
}
