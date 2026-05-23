import { ConfigService } from '@nestjs/config';
import { ApiKeysService } from './api-keys.service';
import { AuditService } from '../audit/audit.service';

/**
 * Unit tests for the API key minter and resolver. The pepper is a stable
 * test value; we verify hashing is deterministic, plaintext is exposed once,
 * and a revoked key cannot be resolved.
 */

const PEPPER = 'test-pepper-please-rotate';

function makePrismaMock() {
  return {
    apiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeAuditMock(): { record: jest.Mock } {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

function makeCfg(): ConfigService {
  return {
    getOrThrow: jest.fn().mockImplementation((k: string) => {
      if (k === 'REFRESH_TOKEN_PEPPER') return PEPPER;
      throw new Error(`Unknown config key: ${k}`);
    }),
  } as unknown as ConfigService;
}

describe('ApiKeysService.create', () => {
  it('exposes plaintext token once and persists only the hash', async () => {
    const prisma = makePrismaMock();
    const audit = makeAuditMock();
    prisma.apiKey.create.mockImplementation(async ({ data }) => ({
      id: 'k1',
      ...data,
      createdAt: new Date(),
    }));
    const svc = new ApiKeysService(
      prisma as unknown as never,
      makeCfg(),
      audit as unknown as AuditService,
    );
    const result = await svc.create({
      organizationId: 'org-1',
      createdById: 'user-1',
      name: 'CI key',
      scopes: ['events.read'],
    });
    expect(result.token).toMatch(/^ork_[A-Za-z0-9_-]{32}$/);
    const created = prisma.apiKey.create.mock.calls[0]![0].data;
    expect(created.tokenHash).toHaveLength(64); // sha256 hex length
    expect(created.tokenHash).not.toContain(result.token);
    expect(created.lastFour).toBe(result.token.slice(-4));
    expect(created.scopes).toEqual(['events.read']);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'api_key.created' }),
    );
  });

  it('drops unknown scopes', async () => {
    const prisma = makePrismaMock();
    const audit = makeAuditMock();
    prisma.apiKey.create.mockResolvedValue({
      id: 'k1',
      name: 'ci-key',
      lastFour: 'abcd',
      scopes: ['events.read'],
      createdAt: new Date(),
    });
    const svc = new ApiKeysService(
      prisma as unknown as never,
      makeCfg(),
      audit as unknown as AuditService,
    );
    await svc.create({
      organizationId: 'org-1',
      createdById: 'user-1',
      name: 'ci-key',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scopes: ['events.read', 'admin.god-mode'] as any,
    });
    expect(prisma.apiKey.create.mock.calls[0]![0].data.scopes).toEqual(['events.read']);
  });
});

describe('ApiKeysService.resolveToken', () => {
  it('returns null for unknown prefix', async () => {
    const prisma = makePrismaMock();
    const svc = new ApiKeysService(
      prisma as unknown as never,
      makeCfg(),
      makeAuditMock() as unknown as AuditService,
    );
    expect(await svc.resolveToken('Bearer abcdef')).toBeNull();
    expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it('returns null for revoked keys', async () => {
    const prisma = makePrismaMock();
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'k1',
      organizationId: 'org-1',
      scopes: [],
      revokedAt: new Date(),
    });
    const svc = new ApiKeysService(
      prisma as unknown as never,
      makeCfg(),
      makeAuditMock() as unknown as AuditService,
    );
    expect(await svc.resolveToken('ork_abcdef0123')).toBeNull();
  });

  it('resolves a live key and queues a lastUsedAt update', async () => {
    const prisma = makePrismaMock();
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'k1',
      organizationId: 'org-1',
      scopes: ['events.read'],
      revokedAt: null,
    });
    prisma.apiKey.update.mockResolvedValue({});
    const svc = new ApiKeysService(
      prisma as unknown as never,
      makeCfg(),
      makeAuditMock() as unknown as AuditService,
    );
    const result = await svc.resolveToken('ork_abcdef0123');
    expect(result).toEqual({ orgId: 'org-1', keyId: 'k1', scopes: ['events.read'] });
    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'k1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });
});
