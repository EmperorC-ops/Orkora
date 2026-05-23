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

/**
 * Unit tests for the verify-on-return settlement path. This is the code the
 * confirmation page calls when a buyer returns from the hosted checkout, so a
 * delayed or missed webhook never strands a paid customer. We isolate
 * settleOrder by spying on the private state-transition methods rather than
 * exercising the full DB transaction.
 */
function makeSettleService(opts: {
  order: Record<string, unknown> | null;
  verifyTransaction?: jest.Mock;
  hasVerify?: boolean;
}) {
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(opts.order) },
  };
  const provider: Record<string, unknown> = { name: 'stripe' };
  if (opts.hasVerify ?? true) {
    provider.verifyTransaction =
      opts.verifyTransaction ?? jest.fn().mockResolvedValue({ status: 'pending' });
  }
  const registry = {
    resolve: jest.fn().mockReturnValue(provider),
  } as unknown as PaymentsRegistry;
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const svc = new PaymentsService(
    prisma as unknown as never,
    {} as never,
    registry,
    {} as never,
    {} as never,
    audit as unknown as AuditService,
  );
  return { svc, prisma, provider, registry };
}

describe('PaymentsService.settleOrder', () => {
  it('throws NotFoundException when the order does not exist', async () => {
    const { svc } = makeSettleService({ order: null });
    await expect(svc.settleOrder('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('short-circuits a non-pending order without touching the provider', async () => {
    const { svc, registry } = makeSettleService({
      order: { id: 'o1', status: 'paid', provider: 'stripe', providerRef: 'cs_1' },
    });
    const out = await svc.settleOrder('o1');
    expect(out).toEqual({ status: 'paid' });
    expect(registry.resolve).not.toHaveBeenCalled();
  });

  it('short-circuits a pending order that has no provider set', async () => {
    const { svc, registry } = makeSettleService({
      order: { id: 'o1', status: 'pending', provider: null, providerRef: null },
    });
    const out = await svc.settleOrder('o1');
    expect(out).toEqual({ status: 'pending' });
    expect(registry.resolve).not.toHaveBeenCalled();
  });

  it('returns current status when the provider cannot verify synchronously', async () => {
    const { svc } = makeSettleService({
      order: { id: 'o1', status: 'pending', provider: 'stripe', providerRef: 'cs_1' },
      hasVerify: false,
    });
    const out = await svc.settleOrder('o1');
    expect(out).toEqual({ status: 'pending' });
  });

  it('marks the order paid and returns "paid" on a successful verify', async () => {
    const paidAt = new Date('2026-06-20T18:00:00.000Z');
    const verify = jest.fn().mockResolvedValue({ status: 'success', paidAt });
    const { svc, provider } = makeSettleService({
      order: { id: 'o1', status: 'pending', provider: 'stripe', providerRef: 'cs_1' },
      verifyTransaction: verify,
    });
    const markPaid = jest
      .spyOn(svc as unknown as { markOrderPaid: (id: string, at: Date) => Promise<void> }, 'markOrderPaid')
      .mockResolvedValue(undefined);

    const out = await svc.settleOrder('o1');

    expect(verify).toHaveBeenCalledWith({ orderId: 'o1', providerRef: 'cs_1' });
    expect(markPaid).toHaveBeenCalledWith('o1', paidAt);
    expect(out).toEqual({ status: 'paid' });
    void provider;
  });

  it('defaults paidAt to now when the provider omits it', async () => {
    const verify = jest.fn().mockResolvedValue({ status: 'success' });
    const { svc } = makeSettleService({
      order: { id: 'o1', status: 'pending', provider: 'stripe', providerRef: 'cs_1' },
      verifyTransaction: verify,
    });
    const markPaid = jest
      .spyOn(svc as unknown as { markOrderPaid: (id: string, at: Date) => Promise<void> }, 'markOrderPaid')
      .mockResolvedValue(undefined);

    const out = await svc.settleOrder('o1');

    expect(out).toEqual({ status: 'paid' });
    expect(markPaid.mock.calls[0]?.[0]).toBe('o1');
    expect(markPaid.mock.calls[0]?.[1]).toBeInstanceOf(Date);
  });

  it('marks the order failed and returns "failed" on a failed verify', async () => {
    const verify = jest.fn().mockResolvedValue({ status: 'failed' });
    const { svc } = makeSettleService({
      order: { id: 'o1', status: 'pending', provider: 'stripe', providerRef: 'cs_1' },
      verifyTransaction: verify,
    });
    const markFailed = jest
      .spyOn(svc as unknown as { markOrderFailed: (id: string, r?: string) => Promise<void> }, 'markOrderFailed')
      .mockResolvedValue(undefined);

    const out = await svc.settleOrder('o1');

    expect(markFailed).toHaveBeenCalledWith('o1', expect.stringContaining('verify'));
    expect(out).toEqual({ status: 'failed' });
  });

  it('leaves the order pending when the provider reports pending', async () => {
    const verify = jest.fn().mockResolvedValue({ status: 'pending' });
    const { svc } = makeSettleService({
      order: { id: 'o1', status: 'pending', provider: 'stripe', providerRef: 'cs_1' },
      verifyTransaction: verify,
    });
    const out = await svc.settleOrder('o1');
    expect(out).toEqual({ status: 'pending' });
  });

  it('swallows a verify error and leaves the order pending', async () => {
    const verify = jest.fn().mockRejectedValue(new Error('network'));
    const { svc } = makeSettleService({
      order: { id: 'o1', status: 'pending', provider: 'stripe', providerRef: 'cs_1' },
      verifyTransaction: verify,
    });
    const out = await svc.settleOrder('o1');
    expect(out).toEqual({ status: 'pending' });
  });
});
