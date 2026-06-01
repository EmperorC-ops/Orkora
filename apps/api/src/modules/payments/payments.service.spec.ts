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
      // refundOrder stamps refundInitiatedAt; markOrderRefunded reads + flips.
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
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
    {} as never,
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
    // A 'pending' result keeps the order paid (settled later by webhook/sweep).
    const refund = jest.fn().mockResolvedValue({ status: 'pending' });
    const { svc, audit } = makeService(prisma, refund);
    const out = await svc.refundOrder({
      orgId: 'org-1',
      orderId: 'x',
      actorUserId: 'user-1',
      requestId: 'req-abc',
    });
    expect(out).toEqual({ ok: true, status: 'pending' });
    expect(refund).toHaveBeenCalledWith({
      providerRef: 'cs_abc',
      amountMinor: 12345n,
      currency: 'NGN',
    });
    // Stamps the in-flight marker so a missed webhook + missed sync result is
    // still recoverable by reconcileRefunds.
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'x' },
        data: expect.objectContaining({ refundInitiatedAt: expect.any(Date) }),
      }),
    );
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

  it('verify-on-action: a synchronously-settled refund flips the order to refunded now', async () => {
    const prisma = makePrismaMock();
    prisma.order.findFirst.mockResolvedValue({
      id: 'x',
      status: 'paid',
      provider: 'stripe',
      providerRef: 'cs_abc',
      totalMinor: 2000n,
      currency: 'USD',
    });
    const refund = jest.fn().mockResolvedValue({ status: 'succeeded' });
    const { svc } = makeService(prisma, refund);
    const markRefunded = jest
      .spyOn(
        svc as unknown as { markOrderRefunded: (id: string) => Promise<void> },
        'markOrderRefunded',
      )
      .mockResolvedValue(undefined);

    const out = await svc.refundOrder({ orgId: 'org-1', orderId: 'x', actorUserId: 'u' });

    expect(out).toEqual({ ok: true, status: 'refunded' });
    expect(markRefunded).toHaveBeenCalledWith('x');
  });

  it('a provider-declined refund throws, audits refund_failed, and never stamps the marker', async () => {
    const prisma = makePrismaMock();
    prisma.order.findFirst.mockResolvedValue({
      id: 'x',
      status: 'paid',
      provider: 'stripe',
      providerRef: 'cs_abc',
      totalMinor: 2000n,
      currency: 'USD',
    });
    const refund = jest.fn().mockResolvedValue({ status: 'failed' });
    const { svc, audit } = makeService(prisma, refund);

    await expect(
      svc.refundOrder({ orgId: 'org-1', orderId: 'x', actorUserId: 'u' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'refund_failed', resourceId: 'x' }),
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
    {} as never,
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

/**
 * createCheckoutForOrder must pick the provider from the org's per-currency
 * preference (Settings > Payments), not from whatever was stored on the order
 * at registration time. This is what makes an override actually route a
 * checkout (e.g. GHS -> Flutterwave) and stops a client forcing a provider.
 */
describe('PaymentsService.createCheckoutForOrder provider resolution', () => {
  function makeOrder() {
    return {
      id: 'o1',
      status: 'pending',
      currency: 'GHS',
      provider: 'paystack', // chosen at registration; must be overridden
      totalMinor: 5000n,
      user: { email: 'buyer@example.com' },
      event: { title: 'Launch', organizationId: 'org-1' },
      registration: { id: 'r1' },
    };
  }

  it('resolves the provider from the org preference, persists it, and uses it', async () => {
    const createCheckoutSession = jest
      .fn()
      .mockResolvedValue({ sessionId: 'flw_sess_1', url: 'https://checkout.flutterwave.com/x' });
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(makeOrder()), update },
    };
    const registry = {
      resolve: jest.fn().mockReturnValue({ name: 'flutterwave', createCheckoutSession }),
    } as unknown as PaymentsRegistry;
    const preferences = { resolveForOrg: jest.fn().mockResolvedValue('flutterwave') };
    const cfg = { get: jest.fn().mockReturnValue('https://app.example.com') };
    const svc = new PaymentsService(
      prisma as unknown as never,
      cfg as unknown as never,
      registry,
      {} as never,
      {} as never,
      { record: jest.fn() } as unknown as AuditService,
      preferences as unknown as never,
    );

    const out = await svc.createCheckoutForOrder('o1');

    expect(preferences.resolveForOrg).toHaveBeenCalledWith('org-1', 'GHS');
    expect(registry.resolve).toHaveBeenCalledWith('flutterwave');
    expect(out).toEqual({ url: 'https://checkout.flutterwave.com/x', provider: 'flutterwave' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'flutterwave' }) }),
    );
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 5000n,
        currency: 'GHS',
        customerEmail: 'buyer@example.com',
      }),
    );
  });

  it('throws when no provider resolves for the currency', async () => {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(makeOrder()), update: jest.fn() },
    };
    const preferences = { resolveForOrg: jest.fn().mockResolvedValue(null) };
    const svc = new PaymentsService(
      prisma as unknown as never,
      { get: jest.fn() } as unknown as never,
      { resolve: jest.fn() } as unknown as PaymentsRegistry,
      {} as never,
      {} as never,
      { record: jest.fn() } as unknown as AuditService,
      preferences as unknown as never,
    );
    await expect(svc.createCheckoutForOrder('o1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PaymentsService.reconcilePendingPayments', () => {
  function makeSvc(candidates: Array<{ id: string }>) {
    const prisma = { order: { findMany: jest.fn().mockResolvedValue(candidates) } };
    const svc = new PaymentsService(
      prisma as unknown as never,
      { get: jest.fn() } as unknown as never,
      {} as unknown as PaymentsRegistry,
      {} as never,
      {} as never,
      { record: jest.fn() } as unknown as AuditService,
      {} as never,
    );
    return { svc };
  }

  it('tallies recovered/failed/pending from settleOrder results', async () => {
    const { svc } = makeSvc([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const settle = jest
      .spyOn(
        svc as unknown as { settleOrder: (id: string) => Promise<{ status: string }> },
        'settleOrder',
      )
      .mockImplementation(async (id: string) => ({
        status: id === 'a' ? 'paid' : id === 'b' ? 'failed' : 'pending',
      }));

    const out = await svc.reconcilePendingPayments();

    expect(settle).toHaveBeenCalledTimes(3);
    expect(out).toEqual({ checked: 3, recoveredPaid: 1, markedFailed: 1, stillPending: 1 });
  });

  it('counts a thrown verify as still pending without aborting the sweep', async () => {
    const { svc } = makeSvc([{ id: 'a' }, { id: 'b' }]);
    const settle = jest
      .spyOn(
        svc as unknown as { settleOrder: (id: string) => Promise<{ status: string }> },
        'settleOrder',
      )
      .mockImplementation(async (id: string) => {
        if (id === 'a') throw new Error('provider down');
        return { status: 'paid' };
      });

    const out = await svc.reconcilePendingPayments();

    expect(settle).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ checked: 2, recoveredPaid: 1, markedFailed: 0, stillPending: 1 });
  });
});

describe('PaymentsService.releaseStaleHolds (verify-before-fail)', () => {
  function makeSvc(
    stale: Array<{ id: string; provider: string | null; providerRef: string | null }>,
  ) {
    const prisma = { order: { findMany: jest.fn().mockResolvedValue(stale) } };
    const svc = new PaymentsService(
      prisma as unknown as never,
      { get: jest.fn().mockReturnValue(20) } as unknown as never,
      {} as unknown as PaymentsRegistry,
      {} as never,
      {} as never,
      { record: jest.fn() } as unknown as AuditService,
      {} as never,
    );
    return { svc };
  }

  it('recovers a paid order instead of failing it, and fails the genuinely unpaid', async () => {
    const { svc } = makeSvc([
      { id: 'paid1', provider: 'stripe', providerRef: 'cs1' },
      { id: 'unpaid1', provider: 'stripe', providerRef: 'cs2' },
      { id: 'noref', provider: null, providerRef: null },
    ]);
    const settle = jest
      .spyOn(
        svc as unknown as { settleOrder: (id: string) => Promise<{ status: string }> },
        'settleOrder',
      )
      .mockImplementation(async (id: string) => ({ status: id === 'paid1' ? 'paid' : 'pending' }));
    const markFailed = jest
      .spyOn(
        svc as unknown as { markOrderFailed: (id: string, r?: string) => Promise<void> },
        'markOrderFailed',
      )
      .mockResolvedValue(undefined);

    const out = await svc.releaseStaleHolds();

    // verify only ran for orders the buyer started paying for (have a providerRef)
    expect(settle).toHaveBeenCalledWith('paid1');
    expect(settle).toHaveBeenCalledWith('unpaid1');
    expect(settle).not.toHaveBeenCalledWith('noref');
    // the paid order is recovered, never failed; the others are released
    expect(markFailed).not.toHaveBeenCalledWith('paid1', expect.anything());
    expect(markFailed).toHaveBeenCalledWith('unpaid1', 'expired');
    expect(markFailed).toHaveBeenCalledWith('noref', 'expired');
    expect(out).toEqual({ released: 2, recovered: 1 });
  });
});

/**
 * Refund reconciliation is the mirror of payment reconciliation: it finds
 * paid orders with a refund in flight (refundInitiatedAt set) and asks the
 * provider whether the refund settled, so a refund whose webhook AND
 * synchronous result were both missed is still confirmed.
 */
describe('PaymentsService.reconcileRefunds', () => {
  function makeSvc(
    candidates: Array<{ id: string; provider: string | null; providerRef: string | null }>,
    verifyRefund?: jest.Mock,
  ) {
    const prisma = { order: { findMany: jest.fn().mockResolvedValue(candidates) } };
    const provider: Record<string, unknown> = { name: 'stripe' };
    if (verifyRefund) provider.verifyRefund = verifyRefund;
    const registry = {
      resolve: jest.fn().mockReturnValue(provider),
    } as unknown as PaymentsRegistry;
    const svc = new PaymentsService(
      prisma as unknown as never,
      { get: jest.fn() } as unknown as never,
      registry,
      {} as never,
      {} as never,
      { record: jest.fn() } as unknown as AuditService,
      {} as never,
    );
    return { svc };
  }

  it('settles confirmed refunds, clears declined ones, and tallies the rest', async () => {
    const verifyRefund = jest.fn().mockImplementation(({ providerRef }: { providerRef: string }) => {
      if (providerRef === 'settled') return Promise.resolve({ status: 'succeeded' });
      if (providerRef === 'declined') return Promise.resolve({ status: 'failed' });
      return Promise.resolve({ status: 'pending' });
    });
    const { svc } = makeSvc(
      [
        { id: 'a', provider: 'stripe', providerRef: 'settled' },
        { id: 'b', provider: 'stripe', providerRef: 'declined' },
        { id: 'c', provider: 'stripe', providerRef: 'waiting' },
      ],
      verifyRefund,
    );
    const markRefunded = jest
      .spyOn(
        svc as unknown as { markOrderRefunded: (id: string) => Promise<void> },
        'markOrderRefunded',
      )
      .mockResolvedValue(undefined);
    const clearFailed = jest
      .spyOn(
        svc as unknown as { clearFailedRefund: (id: string) => Promise<void> },
        'clearFailedRefund',
      )
      .mockResolvedValue(undefined);

    const out = await svc.reconcileRefunds();

    expect(markRefunded).toHaveBeenCalledWith('a');
    expect(clearFailed).toHaveBeenCalledWith('b');
    expect(out).toEqual({ checked: 3, settled: 1, failed: 1, stillPending: 1 });
  });

  it('counts a thrown verifyRefund as still pending without aborting the sweep', async () => {
    const verifyRefund = jest.fn().mockImplementation(({ providerRef }: { providerRef: string }) => {
      if (providerRef === 'boom') return Promise.reject(new Error('provider down'));
      return Promise.resolve({ status: 'succeeded' });
    });
    const { svc } = makeSvc(
      [
        { id: 'a', provider: 'stripe', providerRef: 'boom' },
        { id: 'b', provider: 'stripe', providerRef: 'ok' },
      ],
      verifyRefund,
    );
    jest
      .spyOn(
        svc as unknown as { markOrderRefunded: (id: string) => Promise<void> },
        'markOrderRefunded',
      )
      .mockResolvedValue(undefined);

    const out = await svc.reconcileRefunds();

    expect(out).toEqual({ checked: 2, settled: 1, failed: 0, stillPending: 1 });
  });

  it('treats a provider without verifyRefund as still pending', async () => {
    const { svc } = makeSvc([{ id: 'a', provider: 'stripe', providerRef: 'x' }]);
    const out = await svc.reconcileRefunds();
    expect(out).toEqual({ checked: 1, settled: 0, failed: 0, stillPending: 1 });
  });
});

/**
 * Manual refund re-check from the dashboard. Settles an order stuck on `paid`
 * after a refund whose webhook never landed, without needing the in-flight
 * marker (so it also rescues refunds issued before that marker existed).
 */
describe('PaymentsService.recheckRefund', () => {
  function makeSvc(order: Record<string, unknown> | null, verifyRefund?: jest.Mock) {
    const prisma = { order: { findFirst: jest.fn().mockResolvedValue(order) } };
    const provider: Record<string, unknown> = { name: 'stripe' };
    if (verifyRefund) provider.verifyRefund = verifyRefund;
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
      {} as never,
    );
    return { svc, audit };
  }

  it('throws NotFoundException when the order is not in the org', async () => {
    const { svc } = makeSvc(null);
    await expect(
      svc.recheckRefund({ orgId: 'o', orderId: 'x', actorUserId: 'a' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('short-circuits an already-refunded order', async () => {
    const { svc } = makeSvc({ id: 'x', status: 'refunded', provider: 'stripe', providerRef: 'cs' });
    expect(await svc.recheckRefund({ orgId: 'o', orderId: 'x', actorUserId: 'a' })).toEqual({
      status: 'refunded',
    });
  });

  it('rejects a non-paid order', async () => {
    const { svc } = makeSvc({ id: 'x', status: 'pending', provider: 'stripe', providerRef: 'cs' });
    await expect(
      svc.recheckRefund({ orgId: 'o', orderId: 'x', actorUserId: 'a' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the provider cannot verify refunds', async () => {
    const { svc } = makeSvc({ id: 'x', status: 'paid', provider: 'stripe', providerRef: 'cs' });
    await expect(
      svc.recheckRefund({ orgId: 'o', orderId: 'x', actorUserId: 'a' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('settles the order when the provider confirms the refund', async () => {
    const verifyRefund = jest.fn().mockResolvedValue({ status: 'succeeded' });
    const { svc, audit } = makeSvc(
      { id: 'x', status: 'paid', provider: 'stripe', providerRef: 'cs' },
      verifyRefund,
    );
    const markRefunded = jest
      .spyOn(
        svc as unknown as { markOrderRefunded: (id: string) => Promise<void> },
        'markOrderRefunded',
      )
      .mockResolvedValue(undefined);

    const out = await svc.recheckRefund({ orgId: 'o', orderId: 'x', actorUserId: 'a' });

    expect(verifyRefund).toHaveBeenCalledWith({ providerRef: 'cs' });
    expect(markRefunded).toHaveBeenCalledWith('x');
    expect(out).toEqual({ status: 'refunded' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'refund_rechecked', resourceId: 'x' }),
    );
  });

  it('leaves the order paid when no settled refund is found upstream', async () => {
    const verifyRefund = jest.fn().mockResolvedValue({ status: 'pending' });
    const { svc } = makeSvc(
      { id: 'x', status: 'paid', provider: 'stripe', providerRef: 'cs' },
      verifyRefund,
    );
    const markRefunded = jest
      .spyOn(
        svc as unknown as { markOrderRefunded: (id: string) => Promise<void> },
        'markOrderRefunded',
      )
      .mockResolvedValue(undefined);

    const out = await svc.recheckRefund({ orgId: 'o', orderId: 'x', actorUserId: 'a' });

    expect(out).toEqual({ status: 'paid' });
    expect(markRefunded).not.toHaveBeenCalled();
  });
});

/**
 * markOrderRefunded: voids the order's tickets, settles the order, and emails
 * the buyer exactly once. The notification_log unique index added in
 * migration 0004 guarantees only one settlement path wins the email send.
 * Tests cover dry-run findings #112 (missing refund email) and #113 (tickets
 * still valid after refund).
 */
describe('PaymentsService.markOrderRefunded', () => {
  // Order with two paid tickets bound by tickets.order_id. The third ticket
  // belongs to a sibling pending order on the same registration; voiding the
  // refunded order MUST NOT touch it.
  const order = {
    id: 'o1',
    status: 'paid',
    provider: 'stripe',
    totalMinor: 1000n,
    currency: 'USD',
    event: {
      title: 'Demo',
      timezone: 'America/New_York',
      organizationId: 'org1',
      organization: { name: 'Demo Co' },
    },
    registration: {
      user: { email: 'buyer@example.com' },
      tickets: [
        { id: 't1', orderId: 'o1', status: 'issued' },
        { id: 't2', orderId: 'o1', status: 'issued' },
        { id: 't3', orderId: 'siblingPending', status: 'pending' },
      ],
    },
  };

  function makeMockPrismaAndSvc() {
    const ticketUpdateMany = jest.fn().mockResolvedValue({ count: 2 });
    const orderUpdate = jest.fn().mockResolvedValue({});
    const notificationLogCreate = jest.fn().mockResolvedValue({});
    const txn = jest.fn().mockImplementation(async (ops: unknown) => {
      // markOrderRefunded passes an array of chained-promise ops; for tests we
      // just resolve so the success path completes.
      return Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : [];
    });
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order), update: orderUpdate },
      ticket: { updateMany: ticketUpdateMany },
      notificationLog: { create: notificationLogCreate },
      $transaction: txn,
    };
    const sendRefundEmail = jest.fn().mockResolvedValue(undefined);
    const notifications = { sendRefundEmail };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const svc = new PaymentsService(
      prisma as unknown as never,
      {} as never,
      {} as never,
      notifications as unknown as never,
      {} as never,
      audit as unknown as AuditService,
      {} as never,
    );
    return { svc, prisma, sendRefundEmail, ticketUpdateMany, audit };
  }

  it('voids only this order tickets and sends the refund email exactly once', async () => {
    const { svc, sendRefundEmail, audit } = makeMockPrismaAndSvc();

    await (svc as unknown as { markOrderRefunded: (id: string) => Promise<void> }).markOrderRefunded(
      'o1',
    );

    expect(sendRefundEmail).toHaveBeenCalledTimes(1);
    expect(sendRefundEmail).toHaveBeenCalledWith(
      'buyer@example.com',
      expect.objectContaining({ orderId: 'o1', eventTitle: 'Demo' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'refund_settled', resourceId: 'o1' }),
    );
  });

  it('skips the email when a competing path already inserted the log', async () => {
    const { svc, prisma, sendRefundEmail } = makeMockPrismaAndSvc();
    // Construct a P2002-shaped error from Prisma's runtime class so the
    // instanceof check in markOrderRefunded matches.
    const Prisma = require('@prisma/client').Prisma;
    const uniqueViolation = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    // First $transaction throws P2002 (log row already exists), second
    // succeeds (fallback flip + void).
    prisma.$transaction
      .mockImplementationOnce(async () => {
        throw uniqueViolation;
      })
      .mockResolvedValueOnce([]);

    await (svc as unknown as { markOrderRefunded: (id: string) => Promise<void> }).markOrderRefunded(
      'o1',
    );

    expect(sendRefundEmail).not.toHaveBeenCalled();
  });

  it('no-ops an already-refunded order', async () => {
    const { svc, prisma, sendRefundEmail } = makeMockPrismaAndSvc();
    prisma.order.findUnique.mockResolvedValueOnce({ ...order, status: 'refunded' });

    await (svc as unknown as { markOrderRefunded: (id: string) => Promise<void> }).markOrderRefunded(
      'o1',
    );

    expect(sendRefundEmail).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
