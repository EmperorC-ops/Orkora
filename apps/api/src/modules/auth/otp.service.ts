import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OutboundGuardService, OutboundLimitError } from '../../common/outbound/outbound-guard.service';
import { emailCapKey, ipCapKeys } from '../../common/outbound/ip';
import { isPlainEmailAddress } from '../../common/outbound/text-safety';

/** Email only since October 2026 (see SendOtpDto). */
export type OtpChannel = 'email';
export type OtpPurpose = 'signup' | 'login';

// Per client network: generous for a shared office, campus or mobile carrier
// NAT, far below what a script needs to be useful as a mail cannon.
const MAX_SENDS_PER_IP_PER_HOUR = 60;
// Per inbox across both purposes, counted atomically in the shared counter
// (the database checks above are a read then a write, so parallel requests
// could slip past them).
const MAX_SENDS_PER_INBOX_PER_HOUR = 8;
const MAX_SENDS_PER_INBOX_PER_DAY = 20;

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const SEND_COOLDOWN_SECONDS = 30;
// Beyond the short cooldown, cap how many codes a single destination + purpose
// can request per hour. Defends against inbox/SMS flooding of a victim and SMS
// toll fraud. A real user rarely needs more than a couple of resends.
const MAX_SENDS_PER_HOUR = 6;

class TooManyRequests extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly cfg: ConfigService,
    private readonly guard?: OutboundGuardService,
  ) {}

  async send(
    input: {
      channel: OtpChannel;
      destination: string;
      purpose: OtpPurpose;
    },
    ctx: { ip?: string } = {},
  ): Promise<{ expiresAt: Date }> {
    // Belt and braces behind the DTO: internal callers bypass it.
    if (input.channel !== 'email') throw new BadRequestException('Codes are sent by email only');
    if (input.purpose !== 'signup' && input.purpose !== 'login') {
      throw new BadRequestException('Unsupported code purpose');
    }
    const destination = normalize(input.destination);
    if (!isPlainEmailAddress(destination)) {
      throw new BadRequestException('Enter a valid email address.');
    }

    // Cooldown: do not allow another send within 30 seconds for the same destination + purpose.
    const recent = await this.prisma.otpCode.findFirst({
      where: {
        destination,
        purpose: input.purpose,
        createdAt: { gt: new Date(Date.now() - SEND_COOLDOWN_SECONDS * 1000) },
      },
    });
    if (recent) {
      throw new TooManyRequests('Please wait before requesting another code');
    }

    const sentInLastHour = await this.prisma.otpCode.count({
      where: {
        destination,
        purpose: input.purpose,
        createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (sentInLastHour >= MAX_SENDS_PER_HOUR) {
      throw new TooManyRequests(
        'Too many codes requested for this destination. Please try again later.',
      );
    }

    // Shared caps: this client network, plus the platform-wide hourly budget
    // and kill switch. Checked after the per-address rules above so a
    // cooldown hit never spends the budget.
    if (this.guard) {
      const inbox = emailCapKey(destination);
      const ok = await this.guard.allow('otp', [
        ...ipCapKeys(ctx.ip, MAX_SENDS_PER_IP_PER_HOUR, 3600),
        { name: 'email', value: inbox, limit: MAX_SENDS_PER_INBOX_PER_HOUR, windowSeconds: 3600 },
        { name: 'email_day', value: inbox, limit: MAX_SENDS_PER_INBOX_PER_DAY, windowSeconds: 86_400 },
      ]);
      if (!ok) throw new OutboundLimitError('Too many codes requested. Please try again later.');
    }

    const code = generateCode(CODE_LENGTH);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    await this.prisma.otpCode.create({
      data: {
        destination,
        channel: input.channel,
        purpose: input.purpose,
        codeHash: this.hash(code),
        expiresAt,
      },
    });

    // When LOG_OTP_TO_CONSOLE is on (operator break-glass for email/SMS
    // provider outages or onboarding review), always emit the code at WARN
    // so it can be retrieved from server logs. Never leave this on in real
    // production traffic; the env schema defaults it to false.
    const debugLog = this.cfg.get<boolean>('LOG_OTP_TO_CONSOLE') === true;
    if (debugLog) {
      this.logger.warn(`[OTP DEBUG] ${input.channel} ${input.purpose} -> ${destination} code=${code}`);
    }

    try {
      await this.notifications.sendOtpEmail(destination, code);
    } catch (err) {
      // If the provider rejects (Postmark account in review, SMS provider
      // down, etc.) we never want signup to silently break. Never log the
      // plaintext code here: error logs ship to Sentry / aggregators and the
      // code is a live authentication secret. Under the LOG_OTP_TO_CONSOLE
      // break-glass flag the code was already emitted above; an operator can
      // use that path for rescue. Otherwise log destination + error only.
      this.logger.error(
        `[OTP SEND FAILED] ${input.channel} ${input.purpose} -> ${destination}: ${(err as Error).message}`,
      );
      // The OTP row is in the DB, so verification will still work if the user
      // gets the code out-of-band (debug flag).
      if (!debugLog) throw err;
    }

    return { expiresAt };
  }

  async verify(input: {
    destination: string;
    code: string;
    purpose: OtpPurpose;
  }): Promise<void> {
    const destination = normalize(input.destination);

    const otp = await this.prisma.otpCode.findFirst({
      where: {
        destination,
        purpose: input.purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw new UnauthorizedException('Invalid or expired code');
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many failed attempts. Request a new code.');
    }

    const valid = this.hashesEqual(otp.codeHash, this.hash(input.code));
    if (!valid) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid code');
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
  }

  private hash(code: string): string {
    const pepper = this.cfg.getOrThrow<string>('REFRESH_TOKEN_PEPPER');
    return createHash('sha256').update(code + pepper).digest('hex');
  }

  /** Constant-time comparison of two hex-encoded SHA-256 hashes. */
  private hashesEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }
}

function generateCode(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += randomInt(0, 10).toString();
  return s;
}

function normalize(destination: string): string {
  return String(destination ?? '').trim().toLowerCase();
}
