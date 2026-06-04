import { AuthService } from './auth.service';

/**
 * Non-enumerating signup. The key property: the same observable result
 * (no thrown exception, identical { status, destination } shape) is
 * produced whether the email exists or not. Differences happen only in
 * side effects:
 *
 *   - new email      -> user created (emailVerified=false), signup OTP sent
 *   - pending email  -> user updated, signup OTP sent
 *   - verified email -> no user mutation, collision notice sent
 *
 * If the timing of argon2 hashing dominates the response timing (which it
 * does in production), an attacker timing the endpoint cannot reliably
 * distinguish the three paths either.
 */

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'u-new' }),
      update: jest.fn().mockResolvedValue({ id: 'u-existing' }),
    },
    refreshToken: { create: jest.fn() },
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

const dto = {
  email: 'NEW@Example.com  ',
  password: 'correct-horse-battery-staple',
  fullName: 'New User',
};

describe('AuthService.signupRequest non-enumeration', () => {
  it('new email: creates user with emailVerified=false and sends signup OTP', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);

    const { svc, otp, notifications } = makeService(prisma);
    await expect(svc.signupRequest(dto)).resolves.toEqual({
      status: 'verification_sent',
      destination: 'new@example.com',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'new@example.com',
          emailVerified: false,
        }),
      }),
    );
    expect(otp.send).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', purpose: 'signup' }),
    );
    expect(notifications.sendSignupCollisionNotice).not.toHaveBeenCalled();
  });

  it('pending unverified email: updates passwordHash + profile, resends OTP, no collision notice', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-existing',
      email: 'new@example.com',
      emailVerified: false,
    });

    const { svc, otp, notifications } = makeService(prisma);
    await expect(svc.signupRequest(dto)).resolves.toEqual({
      status: 'verification_sent',
      destination: 'new@example.com',
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u-existing' } }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(otp.send).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'signup' }),
    );
    expect(notifications.sendSignupCollisionNotice).not.toHaveBeenCalled();
  });

  it('verified email: does NOT mutate the account, sends a collision notice instead', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-real',
      email: 'new@example.com',
      emailVerified: true,
    });

    const { svc, otp, notifications } = makeService(prisma);
    await expect(svc.signupRequest(dto)).resolves.toEqual({
      status: 'verification_sent',
      destination: 'new@example.com',
    });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(otp.send).not.toHaveBeenCalled();
    expect(notifications.sendSignupCollisionNotice).toHaveBeenCalledWith(
      'new@example.com',
    );
  });

  it('swallows notification failures so the response shape stays uniform', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-real',
      email: 'new@example.com',
      emailVerified: true,
    });

    const { svc, notifications } = makeService(prisma);
    (notifications.sendSignupCollisionNotice as jest.Mock).mockRejectedValueOnce(
      new Error('postmark down'),
    );

    await expect(svc.signupRequest(dto)).resolves.toEqual({
      status: 'verification_sent',
      destination: 'new@example.com',
    });
  });

  it('swallows OTP send failures so the response shape stays uniform', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);

    const { svc, otp } = makeService(prisma);
    (otp.send as jest.Mock).mockRejectedValueOnce(new Error('mailer down'));

    await expect(svc.signupRequest(dto)).resolves.toEqual({
      status: 'verification_sent',
      destination: 'new@example.com',
    });
  });
});
