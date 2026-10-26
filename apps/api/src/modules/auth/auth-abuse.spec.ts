import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { OutboundGuardService } from '../../common/outbound/outbound-guard.service';
import { MemoryRateCounter } from '../../common/outbound/rate-counter';

/**
 * Signup-abuse rules on the auth surface (docs/SIGNUP_ABUSE_2026-10.md):
 * codes go to one plain email address only, every send is capped per client
 * network and globally, the kill switch stops them, names that carry adverts
 * are refused, the collision notice is sent at most once a day, and the
 * honeypot and CAPTCHA sit in front of both public endpoints.
 */

function cfg(values: Record<string, unknown> = {}) {
  return { get: (k: string) => values[k], getOrThrow: () => 'pepper' } as never;
}

function guard(values: Record<string, unknown> = {}) {
  return OutboundGuardService.withCounter(cfg(values), new MemoryRateCounter());
}

function otpPrisma() {
  return {
    otpCode: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

function makeOtp(g?: OutboundGuardService) {
  const notifications = { sendOtpEmail: jest.fn().mockResolvedValue(undefined) };
  const svc = new OtpService(otpPrisma() as never, notifications as never, cfg({ LOG_OTP_TO_CONSOLE: false }), g);
  return { svc, notifications };
}

async function statusOf(p: Promise<unknown>): Promise<number | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as { getStatus?: () => number }).getStatus?.();
  }
  return undefined;
}

describe('OtpService.send destination and channel rules', () => {
  it.each([
    ['a@example.com, b@example.com'],
    ['Someone <a@example.com>'],
    ['a@example.com\nBcc: b@example.com'],
    ['+2348012345678'],
    ['not-an-email'],
  ])('refuses %s with 400 and sends nothing', async (destination) => {
    const { svc, notifications } = makeOtp(guard());
    expect(await statusOf(svc.send({ channel: 'email', destination, purpose: 'login' }))).toBe(400);
    expect(notifications.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('refuses SMS and the removed purposes even from internal callers', async () => {
    const { svc } = makeOtp(guard());
    expect(
      await statusOf(svc.send({ channel: 'sms' as never, destination: 'a@example.com', purpose: 'login' })),
    ).toBe(400);
    expect(
      await statusOf(
        svc.send({ channel: 'email', destination: 'a@example.com', purpose: 'payment_confirm' as never }),
      ),
    ).toBe(400);
  });
});

describe('OtpService.send shared caps', () => {
  it('caps one client network at 60 codes an hour, across many addresses', async () => {
    const { svc, notifications } = makeOtp(guard());
    for (let i = 0; i < 60; i++) {
      await svc.send({ channel: 'email', destination: `u${i}@example.com`, purpose: 'login' }, { ip: '197.210.1.1' });
    }
    expect(
      await statusOf(svc.send({ channel: 'email', destination: 'u99@example.com', purpose: 'login' }, { ip: '197.210.1.1' })),
    ).toBe(429);
    expect(notifications.sendOtpEmail).toHaveBeenCalledTimes(60);
    // A different network is unaffected.
    await svc.send({ channel: 'email', destination: 'other@example.com', purpose: 'login' }, { ip: '102.89.2.2' });
    expect(notifications.sendOtpEmail).toHaveBeenCalledTimes(61);
  });

  it('treats addresses inside one IPv6 /64 as one network', async () => {
    const { svc } = makeOtp(guard());
    for (let i = 0; i < 60; i++) {
      await svc.send(
        { channel: 'email', destination: `v${i}@example.com`, purpose: 'login' },
        { ip: `2c0f:f5c0:1:2::${(i + 1).toString(16)}` },
      );
    }
    expect(
      await statusOf(
        svc.send({ channel: 'email', destination: 'v99@example.com', purpose: 'login' }, { ip: '2c0f:f5c0:1:2::ffff' }),
      ),
    ).toBe(429);
  });

  it('stops every send when the kill switch is on', async () => {
    const { svc, notifications } = makeOtp(guard({ OUTBOUND_SENDS_DISABLED: '1' }));
    expect(await statusOf(svc.send({ channel: 'email', destination: 'a@example.com', purpose: 'login' }))).toBe(429);
    expect(notifications.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('refuses once the global hourly cap is used up', async () => {
    // Codes may use 35% of the global cap: 7 of 20.
    const { svc, notifications } = makeOtp(guard({ OUTBOUND_GLOBAL_HOURLY_CAP: 20 }));
    for (let i = 0; i < 7; i++) {
      await svc.send({ channel: 'email', destination: `g${i}@example.com`, purpose: 'login' }, { ip: `10.0.0.${i}` });
    }
    expect(
      await statusOf(svc.send({ channel: 'email', destination: 'g9@example.com', purpose: 'login' }, { ip: '10.0.0.9' })),
    ).toBe(429);
    expect(notifications.sendOtpEmail).toHaveBeenCalledTimes(7);
  });

  it('caps one inbox at 8 codes an hour across purposes, Gmail variants included', async () => {
    const { svc, notifications } = makeOtp(guard());
    const variants = ['ada.obi@gmail.com', 'adaobi+1@gmail.com', 'a.d.a.obi@googlemail.com', 'ADAOBI@gmail.com'];
    for (let i = 0; i < 8; i++) {
      await svc.send(
        { channel: 'email', destination: variants[i % variants.length]!, purpose: i % 2 ? 'signup' : 'login' },
        { ip: `10.1.0.${i}` },
      );
    }
    expect(
      await statusOf(svc.send({ channel: 'email', destination: 'adaobi@gmail.com', purpose: 'login' }, { ip: '10.1.0.99' })),
    ).toBe(429);
    expect(notifications.sendOtpEmail).toHaveBeenCalledTimes(8);
  });

  it('counts parallel requests atomically', async () => {
    const { svc, notifications } = makeOtp(guard());
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        svc.send({ channel: 'email', destination: 'race@example.com', purpose: 'login' }, { ip: `10.2.0.${i}` }).catch(() => null),
      ),
    );
    expect(notifications.sendOtpEmail).toHaveBeenCalledTimes(8);
  });

  it('caps an IPv6 /48 at four times the per-network limit across its /64s', async () => {
    const { svc } = makeOtp(guard());
    let refused = 0;
    for (let i = 0; i < 250; i++) {
      const s = await statusOf(
        svc.send(
          { channel: 'email', destination: `w${i}@example.com`, purpose: 'login' },
          { ip: `2c0f:f5c0:1:${(i + 1).toString(16)}::1` },
        ),
      );
      if (s === 429) refused++;
    }
    expect(refused).toBe(10);
  });
});

function makeAuth(g?: OutboundGuardService) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'u1' }),
      update: jest.fn().mockResolvedValue({ id: 'u1' }),
    },
  };
  const otp = { send: jest.fn().mockResolvedValue({ expiresAt: new Date() }) };
  const notifications = { sendSignupCollisionNotice: jest.fn().mockResolvedValue(undefined) };
  const svc = new AuthService(
    prisma as never,
    {} as never,
    cfg(),
    {} as never,
    {} as never,
    otp as never,
    notifications as never,
    g,
  );
  return { svc, prisma, otp, notifications };
}

describe('AuthService.signupRequest abuse rules', () => {
  it.each([
    ['Win cash at bit.ly/xyz'],
    ['Visit www.cheap-pills.example'],
    ['Call 0803 123 4567 now'],
    ['Follow IG: @promo_king'],
  ])('refuses the name %s before touching the database', async (fullName) => {
    const { svc, prisma, otp } = makeAuth(guard());
    expect(await statusOf(svc.signupRequest({ email: 'a@example.com', password: 'longenough1', fullName }))).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(otp.send).not.toHaveBeenCalled();
  });

  it('accepts real names', async () => {
    const { svc } = makeAuth(guard());
    for (const fullName of ['Chukwuemeka Okonkwo', 'Dr. Ade-Ojo', "Mrs. O'Neil"]) {
      await expect(
        svc.signupRequest({ email: 'a@example.com', password: 'longenough1', fullName }),
      ).resolves.toEqual({ status: 'verification_sent', destination: 'a@example.com' });
    }
  });

  it('passes the client address to the code send', async () => {
    const { svc, otp } = makeAuth(guard());
    await svc.signupRequest({ email: 'a@example.com', password: 'longenough1', fullName: 'Ada' }, { ip: '1.2.3.4' });
    expect(otp.send).toHaveBeenCalledWith(
      { channel: 'email', destination: 'a@example.com', purpose: 'signup' },
      { ip: '1.2.3.4' },
    );
  });

  it('sends the collision notice at most once a day per address, with an identical response', async () => {
    const { svc, prisma, notifications } = makeAuth(guard());
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', emailVerified: true });
    for (let i = 0; i < 4; i++) {
      await expect(
        svc.signupRequest({ email: 'owner@example.com', password: 'longenough1', fullName: 'Ada' }),
      ).resolves.toEqual({ status: 'verification_sent', destination: 'owner@example.com' });
    }
    expect(notifications.sendSignupCollisionNotice).toHaveBeenCalledTimes(1);
  });
});

describe('AuthController honeypot and CAPTCHA', () => {
  function makeCtrl(turnstileOk = true) {
    const auth = { signupRequest: jest.fn().mockResolvedValue({ status: 'verification_sent', destination: 'a@example.com' }) };
    const otp = { send: jest.fn().mockResolvedValue({ expiresAt: new Date() }) };
    const turnstile = {
      enforce: jest.fn(async () => {
        if (!turnstileOk) throw Object.assign(new Error('Please complete the security check and try again.'), { getStatus: () => 403 });
      }),
    };
    const ctrl = new AuthController(auth as never, otp as never, turnstile as never);
    return { ctrl, auth, otp, turnstile };
  }

  it('answers a filled honeypot exactly like a real signup and does nothing', async () => {
    const { ctrl, auth, turnstile } = makeCtrl();
    const out = await ctrl.signup(
      { email: 'A@Example.com', password: 'longenough1', fullName: 'Ada', hpField: 'http://spam' },
      { ip: '1.2.3.4' } as never,
    );
    expect(out).toEqual({ status: 'verification_sent', destination: 'a@example.com' });
    expect(auth.signupRequest).not.toHaveBeenCalled();
    expect(turnstile.enforce).not.toHaveBeenCalled();
  });

  it('checks the CAPTCHA with the client address and strips the extra fields', async () => {
    const { ctrl, auth, turnstile } = makeCtrl();
    await ctrl.signup(
      { email: 'a@example.com', password: 'longenough1', fullName: 'Ada', captchaToken: 'tok' },
      { ip: '1.2.3.4' } as never,
    );
    expect(turnstile.enforce).toHaveBeenCalledWith('tok', '1.2.3.4');
    expect(auth.signupRequest).toHaveBeenCalledWith(
      { email: 'a@example.com', password: 'longenough1', fullName: 'Ada' },
      { ip: '1.2.3.4' },
    );
  });

  it('sends no code when the CAPTCHA fails', async () => {
    const { ctrl, otp } = makeCtrl(false);
    expect(
      await statusOf(
        ctrl.sendOtp({ channel: 'email', destination: 'a@example.com', purpose: 'login' }, { ip: '1.2.3.4' } as never),
      ),
    ).toBe(403);
    expect(otp.send).not.toHaveBeenCalled();
  });

  it('answers a filled honeypot on the code request without sending', async () => {
    const { ctrl, otp } = makeCtrl();
    const out = (await ctrl.sendOtp(
      { channel: 'email', destination: 'a@example.com', purpose: 'login', hpField: 'x' },
      { ip: '1.2.3.4' } as never,
    )) as { expiresAt: Date };
    expect(out.expiresAt).toBeInstanceOf(Date);
    expect(otp.send).not.toHaveBeenCalled();
  });
});
