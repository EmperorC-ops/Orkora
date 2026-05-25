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
