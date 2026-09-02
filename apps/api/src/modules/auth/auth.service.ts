import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { SocialLoginDto } from './dto/social.dto';
import { GoogleVerifier, AppleVerifier, type SocialIdentity } from './verifiers/social';
import { OtpService } from './otp.service';
import { NotificationsService } from '../notifications/notifications.service';

interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SignupRequestResult {
  status: 'verification_sent';
  destination: string;
}

/**
 * Machine-readable discriminator for "the password was right but this account
 * has never proved control of its email address".
 *
 * A plain 401 would be wrong twice over: it is indistinguishable from a bad
 * password, so the client shows "wrong credentials" to someone who typed the
 * right one, and it gives them nowhere to go. 403 with this code lets the
 * client route straight to the OTP screen, where a fresh code is already
 * waiting because `login` sent one on the way out.
 */
export const EMAIL_VERIFICATION_REQUIRED = 'email_verification_required';

export class EmailVerificationRequiredException extends ForbiddenException {
  constructor(destination: string) {
    super({
      code: EMAIL_VERIFICATION_REQUIRED,
      destination,
      message: 'Verify your email address to finish signing in. We just sent you a new code.',
    });
  }
}

/**
 * Explicit argon2id parameters (OWASP 2023 guidance: m=19 MiB, t=2, p=1). Pinned
 * so hashing does not drift with library defaults. Existing stored hashes still
 * verify because argon2.verify reads the parameters from the encoded hash. A
 * keyed pepper is deliberately NOT added here: adopting one would invalidate
 * every existing password hash, so it needs a rehash-on-next-login migration
 * rather than a flag flip.
 */
const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly google: GoogleVerifier,
    private readonly apple: AppleVerifier,
    private readonly otp: OtpService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Non-enumerating signup. The response shape, status code, and body are
   * identical whether or not the email is already registered. The branching
   * happens entirely server-side:
   *
   *   - New email -> create an *unverified* user with the supplied
   *     credentials, send an OTP, return verification_sent.
   *   - Email belongs to a *pending unverified* user -> overwrite the
   *     password hash with the freshly-supplied one and send a fresh OTP. This
   *     is the recovery path for "I started signup, never finished, started
   *     again from a different device" without leaking that the email is
   *     already partway through signup.
   *   - Email belongs to a *verified* account -> do not mutate the user, do
   *     not send an OTP, but send a one-off "someone tried to sign up with
   *     your email" notice to the verified owner.
   *
   * In every branch we still perform an argon2.hash on the supplied password
   * so the timing of the response does not leak which branch was taken. The
   * caller is expected to follow up with the existing `/auth/otp/exchange`
   * endpoint once the user enters the code.
   *
   * Errors from the email provider are *swallowed and logged* so a failed
   * notification cannot reveal account existence by surfacing differently in
   * the response. We rely on Sentry + the email provider's own delivery
   * dashboard for observability of those failures.
   */
  async signupRequest(dto: SignupDto): Promise<SignupRequestResult> {
    const email = dto.email.trim().toLowerCase();

    // Always pay the argon2 cost so the response time does not branch on
    // whether the email was already registered. The hash is discarded for
    // the verified-existing case below.
    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTS);

    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (!existing) {
      await this.prisma.user.create({
        data: {
          email,
          fullName: dto.fullName,
          phone: dto.phone,
          passwordHash,
          emailVerified: false,
        },
      });
      await this.sendSignupOtpQuietly(email);
      return { status: 'verification_sent', destination: email };
    }

    if (!existing.emailVerified) {
      // Pending unverified user. Two very different rows land here and the
      // difference matters:
      //
      //   - a genuine abandoned signup (has a passwordHash), where letting the
      //     new credentials win is the intended recovery path, and
      //   - a row created by `resolveUser` in registrations.service for
      //     somebody who bought a ticket and never signed in (no passwordHash).
      //     That row belongs to a real person who is not the caller.
      //
      // Either way the account cannot be used until the OTP is completed (see
      // the verification gate in `login`), so setting the password here is
      // safe. Profile fields are not: an unauthenticated stranger must not be
      // able to rewrite the display name on a ticket holder's record. Fill in
      // blanks, never clobber, mirroring the same discipline
      // registrations.service applies when it backfills a name.
      const emailLocalPart = email.split('@')[0] ?? '';
      const existingNameLooksDerived =
        !existing.fullName?.trim() ||
        existing.fullName.trim().toLowerCase() === emailLocalPart.toLowerCase();

      const data: { fullName?: string; phone?: string; passwordHash: string } = { passwordHash };
      if (existingNameLooksDerived && dto.fullName?.trim()) data.fullName = dto.fullName;
      if (!existing.phone && dto.phone) data.phone = dto.phone;

      if (!existing.passwordHash) {
        // Somebody is setting a password on an account created by event
        // registration or magic-link. Legitimate when it is the owner
        // completing signup, and the OTP proves which. Worth seeing in the
        // logs if it starts happening in volume against many addresses.
        this.logger.warn(
          { email },
          'signup is setting a password on a passwordless account (registration or magic-link origin)',
        );
      }

      await this.prisma.user.update({ where: { id: existing.id }, data });
      await this.sendSignupOtpQuietly(email);
      return { status: 'verification_sent', destination: email };
    }

    // Verified existing user: do not mutate. Notify the real owner so they
    // can spot suspicious signup attempts. Failures here must not leak.
    await this.sendSignupCollisionNoticeQuietly(email);
    return { status: 'verification_sent', destination: email };
  }

  private async sendSignupOtpQuietly(email: string): Promise<void> {
    try {
      await this.otp.send({ channel: 'email', destination: email, purpose: 'signup' });
    } catch (err) {
      // Cooldown / hourly cap throws are *expected* user-paced behavior; do
      // not page on them. Anything else is genuinely unexpected.
      this.logger.warn({ err, email }, 'signup OTP send failed (suppressed)');
    }
  }

  private async sendSignupCollisionNoticeQuietly(email: string): Promise<void> {
    try {
      await this.notifications.sendSignupCollisionNotice(email);
    } catch (err) {
      this.logger.warn({ err, email }, 'signup collision notice failed (suppressed)');
    }
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
    // Per-email exponential backoff: the global per-IP throttler stops a single
    // attacker hammering one machine, but cannot stop a slow distributed
    // brute-force across many source IPs hitting one account. This check (and
    // the upsert below on failure) does. The schedule doubles up to 60s.
    const emailLower = dto.email.trim().toLowerCase();
    const failure = await this.prisma.loginFailure.findUnique({
      where: { emailLower },
    });
    if (failure?.lockedUntil && failure.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Too many failed attempts. Please wait a moment and try again.',
      );
    }

    // Look up by the normalized email so a mixed-case login matches the
    // lowercased address stored at signup, and matches the lockout ledger key.
    const user = await this.prisma.user.findUnique({ where: { email: emailLower } });
    const valid =
      !!user && !!user.passwordHash && (await argon2.verify(user.passwordHash, dto.password));

    if (!valid) {
      const nextCount = (failure?.failedCount ?? 0) + 1;
      const lockSeconds = Math.min(60, 2 ** (nextCount - 1));
      const lockedUntil = new Date(Date.now() + lockSeconds * 1000);
      await this.prisma.loginFailure.upsert({
        where: { emailLower },
        create: { emailLower, failedCount: nextCount, lockedUntil },
        update: { failedCount: nextCount, lockedUntil, lastFailedAt: new Date() },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Success: clear the failure ledger. Done before the verification gate
    // below so a user stuck in verification limbo does not accumulate lockouts
    // on a password they are typing correctly.
    await this.prisma.loginFailure.deleteMany({ where: { emailLower } });

    // Email verification gate.
    //
    // This is load-bearing security, not hygiene. Without it, `signupRequest`'s
    // pending-user recovery branch is a pre-auth account takeover:
    //
    //   1. `resolveUser` in registrations.service creates a user row with
    //      `emailVerified: false` and NO password for anyone who registers for
    //      an event. That row owns their tickets.
    //   2. An attacker POSTs /auth/signup with that email and a password of
    //      their choosing. signupRequest sees an unverified row and treats it
    //      as an abandoned signup, writing the attacker's password onto it.
    //   3. With no gate here, the attacker logs straight in as the victim.
    //
    // The OTP never entered the picture. Requiring a verified email is what
    // makes step 3 fail, which is what makes steps 1 and 2 harmless.
    //
    // Reached only after argon2 has confirmed the password, so telling the
    // caller that this specific account needs verification leaks nothing: a
    // caller who knows the password already knows the account exists. The
    // non-enumeration property of /auth/signup is unaffected.
    if (!user.emailVerified) {
      await this.sendSignupOtpQuietly(emailLower);
      throw new EmailVerificationRequiredException(emailLower);
    }

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
