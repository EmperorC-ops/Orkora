import * as argon2 from 'argon2';
import { AuthService, EMAIL_VERIFICATION_REQUIRED } from './auth.service';

/**
 * The email verification gate on password login, and the account-takeover it
 * exists to close.
 *
 * The chain it breaks, end to end:
 *   1. registrations.service.resolveUser creates a user row for a ticket buyer
 *      with emailVerified=false and NO passwordHash.
 *   2. An attacker POSTs /auth/signup for that email. signupRequest treats the
 *      unverified row as an abandoned signup and writes their password onto it.
 *   3. Without the gate, the attacker logs in as the victim.
 *
 * `blocks the takeover chain` below is the regression test for exactly that.
 */

const PASSWORD = 'correct-horse-battery-staple';

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'u-new' }),
      update: jest.fn().mockResolvedValue({ id: 'u-1' }),
    },
    loginFailure: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    refreshToken: { create: jest.fn().mockResolvedValue({}) },
    membership: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed') };
  const cfg = { getOrThrow: jest.fn().mockReturnValue('pepper') };
  const otp = { send: jest.fn().mockResolvedValue({ expiresAt: new Date() }) };
  const notifications = { sendSignupCollisionNotice: jest.fn().mockResolvedValue(undefined) };
  const svc = new AuthService(
    prisma as never,
    jwt as never,
    cfg as never,
    {} as never,
    {} as never,
    otp as never,
    notifications as never,
  );
  return { svc, otp, notifications };
}

async function userRow(over: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'buyer@example.com',
    fullName: 'Femi Johnson',
    phone: null,
    emailVerified: true,
    passwordHash: await argon2.hash(PASSWORD),
    platformRole: 'none',
    ...over,
  };
}

describe('AuthService.login email verification gate', () => {
  it('issues tokens for a verified account with the right password', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(await userRow());
    const { svc, otp } = makeService(prisma);

    const out = await svc.login({ email: 'buyer@example.com', password: PASSWORD });

    expect(out.accessToken).toBe('signed');
    expect(otp.send).not.toHaveBeenCalled();
  });

  it('refuses an unverified account even with the right password', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(await userRow({ emailVerified: false }));
    const { svc } = makeService(prisma);

    await expect(
      svc.login({ email: 'buyer@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({
        code: EMAIL_VERIFICATION_REQUIRED,
        destination: 'buyer@example.com',
      }),
    });

    // No session may be minted on this path.
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('sends a fresh signup code on the way out so the user is not stranded', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(await userRow({ emailVerified: false }));
    const { svc, otp } = makeService(prisma);

    await expect(svc.login({ email: 'buyer@example.com', password: PASSWORD })).rejects.toThrow();

    expect(otp.send).toHaveBeenCalledWith({
      channel: 'email',
      destination: 'buyer@example.com',
      purpose: 'signup',
    });
  });

  it('clears the lockout ledger before the gate, so a correct password never locks out', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(await userRow({ emailVerified: false }));
    const { svc } = makeService(prisma);

    await expect(svc.login({ email: 'buyer@example.com', password: PASSWORD })).rejects.toThrow();

    expect(prisma.loginFailure.deleteMany).toHaveBeenCalledWith({
      where: { emailLower: 'buyer@example.com' },
    });
    expect(prisma.loginFailure.upsert).not.toHaveBeenCalled();
  });

  it('still returns a plain 401 for a wrong password, verified or not', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(await userRow({ emailVerified: false }));
    const { svc, otp } = makeService(prisma);

    await expect(
      svc.login({ email: 'buyer@example.com', password: 'wrong-password' }),
    ).rejects.toMatchObject({ status: 401 });

    // The gate must not fire before the password check, or it would tell an
    // attacker which addresses have unverified accounts.
    expect(otp.send).not.toHaveBeenCalled();
  });

  it('blocks the takeover chain: ticket buyer row, attacker signup, attacker login', async () => {
    const prisma = makePrisma();

    // Step 1: the row registrations.service creates for a ticket buyer.
    const victimRow = {
      id: 'u-victim',
      email: 'victim@example.com',
      fullName: 'Femi Johnson',
      phone: null,
      emailVerified: false,
      passwordHash: null,
      platformRole: 'none',
    };
    prisma.user.findUnique.mockResolvedValue(victimRow);
    const { svc } = makeService(prisma);

    // Step 2: attacker signs up on the victim's address.
    await expect(
      svc.signupRequest({
        email: 'victim@example.com',
        password: 'attacker-chosen-password',
        fullName: 'Not The Victim',
      }),
    ).resolves.toEqual({ status: 'verification_sent', destination: 'victim@example.com' });

    // The victim's real name must survive an unauthenticated stranger's signup.
    const written = prisma.user.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(written.data.fullName).toBeUndefined();
    expect(written.data.passwordHash).toEqual(expect.any(String));

    // Step 3: attacker tries the password they just set. The gate stops them.
    prisma.user.findUnique.mockResolvedValue({
      ...victimRow,
      passwordHash: written.data.passwordHash as string,
    });
    await expect(
      svc.login({ email: 'victim@example.com', password: 'attacker-chosen-password' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('fills in a blank or email-derived name rather than refusing to touch it', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-2',
      email: 'codehub.expo@example.com',
      // The placeholder loginWithVerifiedEmail leaves behind.
      fullName: 'codehub.expo',
      phone: null,
      emailVerified: false,
      passwordHash: null,
    });
    const { svc } = makeService(prisma);

    await svc.signupRequest({
      email: 'codehub.expo@example.com',
      password: PASSWORD,
      fullName: 'Femi Johnson',
      phone: '+2348012345678',
    });

    const written = prisma.user.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(written.data.fullName).toBe('Femi Johnson');
    expect(written.data.phone).toBe('+2348012345678');
  });
});
