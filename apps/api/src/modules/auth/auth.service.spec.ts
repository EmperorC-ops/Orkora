import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Refresh-token rotation + reuse detection. Rotation alone is not enough: if a
 * stolen, already-rotated token is replayed, we must revoke the whole family so
 * the thief and victim both have to re-authenticate.
 */

function makeService(prisma: unknown, jwt?: unknown, cfg?: unknown) {
  return new AuthService(
    prisma as never,
    (jwt ?? { signAsync: jest.fn().mockResolvedValue('signed.jwt') }) as never,
    (cfg ?? { getOrThrow: jest.fn().mockReturnValue('pepper') }) as never,
    {} as never,
    {} as never,
  );
}

describe('AuthService.refresh', () => {
  it('rotates: revokes the presented token and issues a new pair', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      refreshToken: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'rt1', user: { id: 'u1', email: 'a@b.co' } }),
        update,
        updateMany: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ platformRole: 'none' }) },
      membership: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = makeService(prisma);

    const out = await svc.refresh('good-token');

    // The presented token is revoked (rotation), and a fresh pair is returned.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rt1' }, data: { revokedAt: expect.any(Date) } }),
    );
    expect(out).toEqual(
      expect.objectContaining({ accessToken: 'signed.jwt', refreshToken: expect.any(String) }),
    );
  });

  it('reuse detection: a replayed already-revoked token revokes the whole family', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const prisma = {
      refreshToken: {
        // 1st call (active tokens) finds nothing; 2nd call (any-status) finds the
        // revoked token, proving this hash was issued to user u1.
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ userId: 'u1' }),
        updateMany,
        update: jest.fn(),
      },
    };
    const svc = makeService(prisma);

    await expect(svc.refresh('stolen-rotated-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      }),
    );
  });

  it('an unknown token is rejected without touching any family', async () => {
    const updateMany = jest.fn();
    const prisma = {
      refreshToken: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        updateMany,
        update: jest.fn(),
      },
    };
    const svc = makeService(prisma);

    await expect(svc.refresh('never-seen')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

/**
 * Per-account exponential backoff for password login. The per-IP throttler
 * stops a single attacker hammering one machine; this defends a single account
 * against a distributed brute-force across many IPs.
 */
describe('AuthService.login backoff', () => {
  it('rejects with a wait message when the account is still locked', async () => {
    const future = new Date(Date.now() + 30_000);
    const prisma = {
      loginFailure: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ emailLower: 'a@b.co', failedCount: 3, lockedUntil: future }),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: { findUnique: jest.fn(), update: jest.fn() },
    };
    const svc = makeService(prisma);

    await expect(svc.login({ email: 'A@B.co', password: 'guess' })).rejects.toMatchObject({
      message: expect.stringContaining('Too many failed attempts'),
    });
    // Password is never checked while the lockout is active.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.loginFailure.upsert).not.toHaveBeenCalled();
  });

  it('increments the failure counter and sets an exponential lock on a bad password', async () => {
    const prisma = {
      loginFailure: {
        findUnique: jest.fn().mockResolvedValue({ failedCount: 2, lockedUntil: null }),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u1', email: 'a@b.co', passwordHash: '$argon2id$placeholder' }),
        update: jest.fn(),
      },
    };
    // argon2.verify throws on a malformed hash; mock it to a clean `false` so the
    // test exercises the "bad password" branch of login() rather than the
    // accidental "malformed stored hash" branch.
    const argon2 = require('argon2');
    jest.spyOn(argon2, 'verify').mockResolvedValueOnce(false);

    const svc = makeService(prisma);

    await expect(svc.login({ email: 'a@b.co', password: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // Third failure: lock for 2^(3-1) = 4 seconds.
    expect(prisma.loginFailure.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailLower: 'a@b.co' },
        update: expect.objectContaining({ failedCount: 3, lockedUntil: expect.any(Date) }),
      }),
    );
  });

  it('clears the failure record on a successful login', async () => {
    const prisma = {
      loginFailure: {
        findUnique: jest.fn().mockResolvedValue({ failedCount: 2, lockedUntil: null }),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u1', email: 'a@b.co', passwordHash: '$argon2id$ok' }),
        update: jest.fn().mockResolvedValue({}),
      },
      refreshToken: { create: jest.fn().mockResolvedValue({}) },
      membership: { findMany: jest.fn().mockResolvedValue([]) },
    };
    // Mock argon2.verify directly so we get success without a real password hash.
    const argon2 = require('argon2');
    jest.spyOn(argon2, 'verify').mockResolvedValueOnce(true);

    const svc = makeService(prisma);
    await svc.login({ email: 'a@b.co', password: 'right' });

    expect(prisma.loginFailure.deleteMany).toHaveBeenCalledWith({
      where: { emailLower: 'a@b.co' },
    });
  });
});
