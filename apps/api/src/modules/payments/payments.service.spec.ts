import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { AuditService } from '../audit/audit.service';
import { PaymentsRegistry } from './providers/registry';

/**
 * Unit tests for the refund initiation path. Other PaymentsService methods
 * are covered indirectly by the e2e fixtures we run against the API; this
 * spec focuses on the org-tenancy + state-machine guards in refundOrder().
 */

function makePrismaMock() {
  return {
    order: {
      findFirst: jest.fn(),
    },
  };
}

function makeRegistry(refund: jest.Mock): PaymentsRegistry {
  return {
    resolve: jest.fn().mockReturnValue({ name: 'stripe', refund }),
    getEnabledNames: jest.fn(),
    pickForCurrency: jest.fn(),
    has: jest.fn(),
  } as unknown as PaymentsRegistry;
}

function makeAudit(): { record: jest.Mock } {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

const NOTIFICATIONS = {} as never;
const SIGNER = {} as never;
const CFG = {} as never;

function makeService(prisma: ReturnType<typeof makePrismaMock>, refund: jest.Mock) {
  const audit = makeAudit();
  const registry = makeRegistry(refund);
  const svc = new PaymentsService(
    prisma as unknown as never,
    CFG,
    registry,
    NOTIFICATIONS,
    SIGNER,
    audit as unknown as AuditService,
  );
  return { svc, audit, registry };
}

describe('PaymentsService.refundOrder', () => {
  it('throws NotFoundException when the order is not in the org', async () => {
    const prisma = makePrismaMock();
    prisma.order.findFirst.mockResolvedValue(null);
    const { svc } = makeService(prisma, jest.fn());
    await expect(
      svc.refundOrder({ orgId: 'o', orderId: 'x', actorUserId: 'a' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to refund anything other than a paid order', async () => {
    const prisma = makePrismaMock();
    prisma.order.findFirst.mockResolvedValue({
      id: 'x',
      status: 'pending',
      provider: 'stripe',
      providerRef: 'cs_xyz',
      totalMinor: 1000n,
      currency: 'NGN',
    });
    const { svc } = makeService(prisma, jest.fn());
    await expect(
      svc.refundOrder({ orgId: 'o', orderId: 'x', actorUserId: 'a' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to refund an order with no providerRef', async () => {
    const prisma = makePrismaMock();
    prisma.order.findFirst.mockResolvedValue({
      id: 'x',
      status: 'paid',
      provider: 'stripe',
      providerRef: null,
      totalMinor: 1000n,
      currency: 'NGN',
    });
    const { svc } = makeService(prisma, jest.fn());
    await expect(
      svc.refundOrder({ orgId: 'o', orderId: 'x', actorUserId: 'a' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calls provider.refund with full amount, then writes the audit row including requestId', async () => {
    const prisma = makePrismaMock();
    prisma.order.findFirst.mockResolvedValue({
      id: 'x',
      status: 'paid',
      provider: 'stripe',
      providerRef: 'cs_abc',
      totalMinor: 12345n,
      currency: 'NGN',
    });
    const refund = jest.fn().mockResolvedValue(undefined);
    const { svc, audit } = makeService(prisma, refund);
    const out = await svc.refundOrder({
      orgId: 'org-1',
      orderId: 'x',
      actorUserId: 'user-1',
      requestId: 'req-abc',
    });
    expect(out).toEqual({ ok: true });
    expect(refund).toHaveBeenCalledWith({
      providerRef: 'cs_abc',
      amountMinor: 12345n,
      currency: 'NGN',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        actorUserId: 'user-1',
        action: 'refund_initiated',
        resourceType: 'order',
        resourceId: 'x',
        requestId: 'req-abc',
      }),
    );
  });
});
