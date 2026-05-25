import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { OtpService } from './otp.service';

/**
 * OTP abuse controls: a short per-destination cooldown, an hourly per-
 * destination send cap (toll-fraud / inbox-flood defense), and per-code attempt
 * lockout on verify.
 */

const PEPPER = 'test-pepper';

function makeService(prisma: unknown, notifications?: unknown) {
  const cfg = {
    get: jest.fn().mockReturnValue(false), // LOG_OTP_TO_CONSOLE
    getOrThrow: jest.fn().mockReturnValue(PEPPER),
  };
  return new OtpService(
    prisma as never,
    (notifications ?? { sendOtpEmail: jest.fn().mockResolvedValue(undefined) }) as never,
    cfg as never,
  );
}

async function statusOf(p: Promise<unknown>): Promise<number | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as { getStatus?: () => number }).getStatus?.();
  }
  return undefined;
}

describe('OtpService.send abuse controls', () => {
  it('rejects a second send within the cooldown window (429)', async () => {
    const prisma = {
      otpCode: {
        findFirst: jest.fn().mockResolvedValue({ id: 'recent' }), // a recent code exists
        count: jest.fn(),
        create: jest.fn(),
      },
    };
    const svc = makeService(prisma);
    expect(await statusOf(svc.send({ channel: 'email', destination: 'a@b.co', purpose: 'login' }))).toBe(
      429,
    );
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });

  it('rejects once the hourly per-destination cap is reached (429)', async () => {
    const prisma = {
      otpCode: {
        findFirst: jest.fn().mockResolvedValue(null), // no recent code (cooldown passed)
        count: jest.fn().mockResolvedValue(6), // already at the hourly cap
        create: jest.fn(),
      },
    };
    const svc = makeService(prisma);
    expect(await statusOf(svc.send({ channel: 'email', destination: 'a@b.co', purpose: 'login' }))).toBe(
      429,
    );
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });

  it('sends when under both limits', async () => {
    const sendOtpEmail = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      otpCode: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const svc = makeService(prisma, { sendOtpEmail });

    const out = await svc.send({ channel: 'email', destination: 'A@B.co', purpose: 'login' });

    expect(prisma.otpCode.create).toHaveBeenCalled();
    expect(sendOtpEmail).toHaveBeenCalledWith('a@b.co', expect.any(String)); // normalized
    expect(out.expiresAt).toBeInstanceOf(Date);
  });
});

describe('OtpService.verify', () => {
  it('locks out after too many failed attempts on a code', async () => {
    const prisma = {
      otpCode: {
        findFirst: jest.fn().mockResolvedValue({ id: 'o1', attempts: 5, codeHash: 'x' }),
        update: jest.fn(),
      },
    };
    const svc = makeService(prisma);
    await expect(
      svc.verify({ destination: 'a@b.co', code: '000000', purpose: 'login' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('increments attempts and rejects a wrong code', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      otpCode: {
        findFirst: jest.fn().mockResolvedValue({ id: 'o1', attempts: 0, codeHash: 'does-not-match' }),
        update,
      },
    };
    const svc = makeService(prisma);
    await expect(
      svc.verify({ destination: 'a@b.co', code: '123456', purpose: 'login' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    );
  });

  it('consumes the code on a correct match', async () => {
    const correctHash = createHash('sha256').update('123456' + PEPPER).digest('hex');
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      otpCode: {
        findFirst: jest.fn().mockResolvedValue({ id: 'o1', attempts: 0, codeHash: correctHash }),
        update,
      },
    };
    const svc = makeService(prisma);

    await expect(
      svc.verify({ destination: 'a@b.co', code: '123456', purpose: 'login' }),
    ).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'o1' }, data: { consumedAt: expect.any(Date) } }),
    );
  });
});
