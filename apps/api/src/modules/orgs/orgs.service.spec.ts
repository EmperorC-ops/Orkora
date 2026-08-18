import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrgsService } from './orgs.service';
import { AuditService } from '../audit/audit.service';

/**
 * Unit tests for the org-wide settings actions: profile update, member role
 * change, member removal. Prisma + AuditService are stubbed; we are checking
 * that the service enforces the "last owner" invariants and writes audit rows.
 */

type PrismaMock = {
  organization: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  membership: {
    findUnique: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

function makePrismaMock(): PrismaMock {
  return {
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    membership: {
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function makeAuditMock(): { record: jest.Mock } {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

describe('OrgsService.update', () => {
  it('throws when slug already taken by a different org', async () => {
    const prisma = makePrismaMock();
    const audit = makeAuditMock();
    prisma.organization.findUnique
      .mockResolvedValueOnce({ id: 'org-1', name: 'Old', slug: 'old' })
      .mockResolvedValueOnce({ id: 'org-2' });
    const svc = new OrgsService(prisma as unknown as never, audit as unknown as AuditService);
    await expect(
      svc.update('org-1', 'user-1', { slug: 'taken' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('writes audit row on successful update', async () => {
    const prisma = makePrismaMock();
    const audit = makeAuditMock();
    prisma.organization.findUnique.mockResolvedValueOnce({
      id: 'org-1',
      name: 'Old',
      slug: 'old',
      logoUrl: null,
      brandColor: '#fff',
      countryCode: 'NG',
    });
    prisma.organization.update.mockResolvedValueOnce({ id: 'org-1', name: 'New' });
    const svc = new OrgsService(prisma as unknown as never, audit as unknown as AuditService);
    await svc.update('org-1', 'user-1', { name: 'New' }, 'req-123');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'organization.updated',
        organizationId: 'org-1',
        actorUserId: 'user-1',
        requestId: 'req-123',
      }),
    );
  });
});

describe('OrgsService.updateMemberRole', () => {
  it('rejects an unknown role', async () => {
    const prisma = makePrismaMock();
    const audit = makeAuditMock();
    const svc = new OrgsService(prisma as unknown as never, audit as unknown as AuditService);
    await expect(
      svc.updateMemberRole('org-1', 'actor', 'target', 'pirate'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to demote the last owner', async () => {
    const prisma = makePrismaMock();
    const audit = makeAuditMock();
    prisma.membership.findUnique.mockResolvedValue({
      id: 'mem-1',
      userId: 'target',
      role: 'owner',
    });
    prisma.membership.count.mockResolvedValue(1);
    const svc = new OrgsService(prisma as unknown as never, audit as unknown as AuditService);
    await expect(
      svc.updateMemberRole('org-1', 'actor', 'target', 'admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('demotes an owner when at least one other owner remains', async () => {
    const prisma = makePrismaMock();
    const audit = makeAuditMock();
    prisma.membership.findUnique.mockResolvedValue({
      id: 'mem-1',
      userId: 'target',
      role: 'owner',
    });
    prisma.membership.count.mockResolvedValue(2);
    prisma.membership.update.mockResolvedValue({ id: 'mem-1', role: 'admin' });
    const svc = new OrgsService(prisma as unknown as never, audit as unknown as AuditService);
    await svc.updateMemberRole('org-1', 'actor', 'target', 'admin', 'req-x');
    expect(prisma.membership.update).toHaveBeenCalledWith({
      where: { id: 'mem-1' },
      data: { role: 'admin' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'membership.role_changed' }),
    );
  });
});

describe('OrgsService.removeMember', () => {
  it('refuses to remove the last owner', async () => {
    const prisma = makePrismaMock();
    const audit = makeAuditMock();
    prisma.membership.findUnique.mockResolvedValue({
      id: 'mem-1',
      userId: 'target',
      role: 'owner',
    });
    prisma.membership.count.mockResolvedValue(1);
    const svc = new OrgsService(prisma as unknown as never, audit as unknown as AuditService);
    await expect(
      svc.removeMember('org-1', 'actor', 'target'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to remove yourself', async () => {
    const prisma = makePrismaMock();
    const audit = makeAuditMock();
    prisma.membership.findUnique.mockResolvedValue({
      id: 'mem-1',
      userId: 'actor',
      role: 'admin',
    });
    const svc = new OrgsService(prisma as unknown as never, audit as unknown as AuditService);
    await expect(
      svc.removeMember('org-1', 'actor', 'actor'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFoundException when membership does not exist', async () => {
    const prisma = makePrismaMock();
    const audit = makeAuditMock();
    prisma.membership.findUnique.mockResolvedValue(null);
    const svc = new OrgsService(prisma as unknown as never, audit as unknown as AuditService);
    await expect(
      svc.removeMember('org-1', 'actor', 'ghost'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids an admin from removing an owner (M6)', async () => {
    const prisma = makePrismaMock();
    const audit = makeAuditMock();
    // First findUnique resolves the target (owner), second resolves the actor (admin).
    prisma.membership.findUnique
      .mockResolvedValueOnce({ id: 'mem-owner', userId: 'target', role: 'owner' })
      .mockResolvedValueOnce({ id: 'mem-admin', userId: 'actor', role: 'admin' });
    const svc = new OrgsService(prisma as unknown as never, audit as unknown as AuditService);
    await expect(
      svc.removeMember('org-1', 'actor', 'target'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.membership.delete).not.toHaveBeenCalled();
  });
});
