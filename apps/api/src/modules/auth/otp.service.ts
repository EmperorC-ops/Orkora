import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export type OtpChannel = 'email' | 'sms';
export type OtpPurpose = 'signup' | 'login' | 'payment_confirm' | 'phone_verify';

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const SEND_COOLDOWN_SECONDS = 30;

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
  ) {}

  async send(input: {
    channel: OtpChannel;
    destination: string;
    purpose: OtpPurpose;
  }): Promise<{ expiresAt: Date }> {
    const destination = normalize(input.destination, input.channel);

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
      if (input.channel === 'email') {
        await this.notifications.sendOtpEmail(destination, code);
      } else {
        await this.notifications.sendOtpSms(destination, code);
      }
    } catch (err) {
      // If the provider rejects (Postmark account in review, SMS provider
      // down, etc.) we never want signup to silently break. Log the code
      // so an operator can rescue the user, and rethrow so the caller can
      // decide whether to surface a retry message.
      this.logger.error(
        `[OTP SEND FAILED] ${input.channel} -> ${destination}: ${(err as Error).message}. Code (rescue): ${code}`,
      );
      // In debug mode we already logged the code above. The OTP row is in
      // the DB, so verification will still work if the user gets the code
      // out-of-band.
      if (!debugLog) throw err;
    }

    return { expiresAt };
  }

  async verify(input: {
    destination: string;
    code: string;
    purpose: OtpPurpose;
  }): Promise<void> {
    const channel: OtpChannel = input.destination.includes('@') ? 'email' : 'sms';
    const destination = normalize(input.destination, channel);

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

    const valid = otp.codeHash === this.hash(input.code);
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
}

function generateCode(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += randomInt(0, 10).toString();
  return s;
}

function normalize(destination: string, channel: OtpChannel): string {
  if (channel === 'email') return destination.trim().toLowerCase();
  // SMS: strip spaces, hyphens, parens. Caller should send E.164 like +2348012345678.
  return destination.replace(/[\s\-()]/g, '');
}
