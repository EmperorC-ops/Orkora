import { PaymentsService } from './payments.service';
import { AuditService } from '../audit/audit.service';
import { PaymentsRegistry } from './providers/registry';
import type { WebhookOutcome } from './providers/types';

/**
 * The settlement amount gate.
 *
 * Signature verification proves a webhook came from the provider. It proves
 * nothing about the figure inside it, and nothing about whether our own order
 * total still matches what was charged. These tests pin the four outcomes:
 *
 *   exact      -> settle, no flag
 *   over       -> settle anyway, flag for a finance refund
 *   under      -> DO NOT settle, quarantine, no tickets, no receipt
 *   wrong ccy  -> DO NOT settle, quarantine
 *
 * plus the two properties that make the quarantine safe to leave in place:
 * the stale-hold sweep must not expire a held order, and a later correct
 * settlement must clear the hold.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

const ORDER_ID = '00000000-0000-0000-0000-0000000000aa';

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    eventId: 'evt-1',
    status: 'pending',
    provider: 'paystack',
    totalMinor: 500000n, // NGN 5,000.00 in canonical minor units
    currency: 'NGN',
    settlementHoldAt: null,
    settlementHoldReason: null,
    registration: {
      id: 'reg-1',
      tickets: [{ orderId: ORDER_ID, code: 'T1', holderName: 'A', tier: { name: 'GA' } }],
      user: { email: 'buyer@example.com' },
    },
    items: [{ quantity: 1, unitPriceMinor: 500000n, tier: { name: 'GA' } }],
    event: {
      title: 'Test Event',
      startAt: new Date('2026-09-01T10:00:00Z'),
      endAt: new Date('2026-09-01T18:00:00Z'),
      timezone: 'Africa/Lagos',
      organizationId: 'org-1',
      organization: { name: 'Test Org' },
    },
    ...overrides,
  };
}

function makeHarness(order: ReturnType<typeof makeOrder>) {
  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    registration: { update: jest.fn() },
    ticket: { updateMany: jest.fn() },
    notificationLog: { create: jest.fn() },
    webhookEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const notifications = {
    sendTicketConfirmationEmail: jest.fn().mockResolvedValue(undefined),
    sendReceiptEmail: jest.fn().mockResolvedValue(undefined),
  };
  const parseAndVerifyWebhook = jest.fn();
  const registry = {
    resolve: jest.fn().mockReturnValue({ name: 'paystack', parseAndVerifyWebhook }),
    getEnabledNames: jest.fn(),
    pickForCurrency: jest.fn(),
    has: jest.fn(),
  } as unknown as PaymentsRegistry;
  const cfg = { get: jest.fn().mockReturnValue(undefined) };
  const signer = { sign: jest.fn().mockReturnValue('sig') };

  const svc = new PaymentsService(
    prisma as unknown as never,
    cfg as unknown as never,
    registry,
    notifications as unknown as never,
    signer as unknown as never,
    audit as unknown as AuditService,
    {} as never,
  );
  return { svc, prisma, audit, notifications, parseAndVerifyWebhook };
}

function paidOutcome(amountMinor: bigint, currency = 'NGN'): WebhookOutcome {
  return {
    type: 'paid',
    orderId: ORDER_ID,
    providerEventId: `evt_${amountMinor}_${currency}`,
    paidAt: new Date('2026-08-25T12:00:00Z'),
    amountMinor,
    currency,
  };
}

/** True when the harness ran the flip-to-paid transaction. */
function didSettle(prisma: { $transaction: jest.Mock }): boolean {
  return prisma.$transaction.mock.calls.length > 0;
}

/** The settlement-hold write, if one happened. */
function holdWrite(prisma: { order: { update: jest.Mock } }) {
  return prisma.order.update.mock.calls
    .map(([arg]) => arg as { data?: Record<string, unknown> })
    .find((arg) => arg?.data?.settlementHoldAt instanceof Date);
}

describe('settlement amount gate', () => {
  it('settles when the captured amount and currency match exactly', async () => {
    const h = makeHarness(makeOrder());
    h.parseAndVerifyWebhook.mockResolvedValue(paidOutcome(500000n));

    const res = await h.svc.handleWebhook('paystack', Buffer.from('{}'), 'sig');

    expect(res).toEqual({ ok: true, outcome: 'paid' });
    expect(didSettle(h.prisma)).toBe(true);
    expect(holdWrite(h.prisma)).toBeUndefined();
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('refuses to settle an underpayment and quarantines the order', async () => {
    const h = makeHarness(makeOrder());
    h.parseAndVerifyWebhook.mockResolvedValue(paidOutcome(100n)); // NGN 1.00

    const res = await h.svc.handleWebhook('paystack', Buffer.from('{}'), 'sig');

    expect(res).toEqual({ ok: true, outcome: 'held' });
    expect(didSettle(h.prisma)).toBe(false);
    expect(h.notifications.sendTicketConfirmationEmail).not.toHaveBeenCalled();
    expect(h.notifications.sendReceiptEmail).not.toHaveBeenCalled();

    const hold = holdWrite(h.prisma);
    expect(hold?.data?.settlementHoldReason).toBe('underpaid');
    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'payment.settlement_underpaid',
        resourceId: ORDER_ID,
        organizationId: 'org-1',
      }),
    );
  });

  it('refuses to settle when the currency differs, even at the same figure', async () => {
    const h = makeHarness(makeOrder());
    // 5,000.00 charged, but in USD against an NGN order. Same number,
    // roughly 1,500x the value. Amount-only checking would pass this.
    h.parseAndVerifyWebhook.mockResolvedValue(paidOutcome(500000n, 'USD'));

    const res = await h.svc.handleWebhook('paystack', Buffer.from('{}'), 'sig');

    expect(res).toEqual({ ok: true, outcome: 'held' });
    expect(didSettle(h.prisma)).toBe(false);
    expect(holdWrite(h.prisma)?.data?.settlementHoldReason).toBe('currency_mismatch');
    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'payment.settlement_currency_mismatch' }),
    );
  });

  it('settles an overpayment but records the excess for refund', async () => {
    const h = makeHarness(makeOrder());
    h.parseAndVerifyWebhook.mockResolvedValue(paidOutcome(600000n));

    const res = await h.svc.handleWebhook('paystack', Buffer.from('{}'), 'sig');

    expect(res).toEqual({ ok: true, outcome: 'paid' });
    expect(didSettle(h.prisma)).toBe(true);
    expect(holdWrite(h.prisma)).toBeUndefined();
    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'payment.settlement_overpaid',
        metadata: expect.objectContaining({ deltaMinor: '100000' }),
      }),
    );
  });

  it('does not re-alert on an order already held for the same reason', async () => {
    const h = makeHarness(makeOrder({ settlementHoldReason: 'underpaid' }));
    h.parseAndVerifyWebhook.mockResolvedValue(paidOutcome(100n));

    const res = await h.svc.handleWebhook('paystack', Buffer.from('{}'), 'sig');

    expect(res).toEqual({ ok: true, outcome: 'held' });
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('clears the hold when a later, correct settlement arrives', async () => {
    const h = makeHarness(makeOrder({ settlementHoldReason: 'underpaid', settlementHoldAt: new Date() }));
    h.parseAndVerifyWebhook.mockResolvedValue(paidOutcome(500000n));

    await h.svc.handleWebhook('paystack', Buffer.from('{}'), 'sig');

    expect(didSettle(h.prisma)).toBe(true);
    // The flip-to-paid update is built inside $transaction; assert the payload
    // nulls the hold so a resolved order does not stay flagged.
    const txnArgs = h.prisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(txnArgs)).toBe(true);
    expect(h.prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'paid', settlementHoldAt: null }),
      }),
    );
  });
});

describe('releaseStaleHolds', () => {
  it('never considers an order that is under settlement quarantine', async () => {
    const h = makeHarness(makeOrder());
    await h.svc.releaseStaleHolds();

    expect(h.prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'pending', settlementHoldAt: null }),
      }),
    );
  });
});
