import { ConfigService } from '@nestjs/config';
import { orderActivity } from '../../common/order-activity';
import { PaymentsMaintenanceCron } from './payments-maintenance.cron';
import type { PaymentsService } from './payments.service';

function makePayments() {
  return {
    reconcilePendingPayments: jest.fn().mockResolvedValue({}),
    reconcileRefunds: jest.fn().mockResolvedValue({}),
    releaseStaleHolds: jest.fn().mockResolvedValue({ released: 0, recovered: 0 }),
  } as unknown as PaymentsService & {
    reconcilePendingPayments: jest.Mock;
    reconcileRefunds: jest.Mock;
    releaseStaleHolds: jest.Mock;
  };
}

function makeCfg(ttlMin?: number): ConfigService {
  return { get: () => ttlMin } as unknown as ConfigService;
}

describe('PaymentsMaintenanceCron (Neon-aware scheduling)', () => {
  beforeEach(() => {
    orderActivity.reset();
    jest.useRealTimers();
  });

  it('does not touch the database on the 15-minute tick when there has been no order activity', async () => {
    const payments = makePayments();
    const cron = new PaymentsMaintenanceCron(payments, makeCfg(20));

    await cron.sweepIfActive();

    expect(payments.reconcilePendingPayments).not.toHaveBeenCalled();
    expect(payments.reconcileRefunds).not.toHaveBeenCalled();
    expect(payments.releaseStaleHolds).not.toHaveBeenCalled();
  });

  it('runs all three sweeps on the 15-minute tick when an order was touched recently', async () => {
    const payments = makePayments();
    const cron = new PaymentsMaintenanceCron(payments, makeCfg(20));

    orderActivity.touch();
    await cron.sweepIfActive();

    expect(payments.reconcilePendingPayments).toHaveBeenCalledTimes(1);
    expect(payments.reconcileRefunds).toHaveBeenCalledTimes(1);
    expect(payments.releaseStaleHolds).toHaveBeenCalledTimes(1);
  });

  it('stops sweeping once the activity window (TTL + 30 min) has passed', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-05T10:00:00Z'));
    const payments = makePayments();
    const cron = new PaymentsMaintenanceCron(payments, makeCfg(20));

    orderActivity.touch();
    jest.setSystemTime(new Date('2026-09-05T10:49:00Z')); // 49 min < 50 min window
    await cron.sweepIfActive();
    expect(payments.releaseStaleHolds).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-09-05T10:51:00Z')); // 51 min > 50 min window
    await cron.sweepIfActive();
    expect(payments.releaseStaleHolds).toHaveBeenCalledTimes(1);
  });

  it('always runs the daily sweep, regardless of activity', async () => {
    const payments = makePayments();
    const cron = new PaymentsMaintenanceCron(payments, makeCfg(undefined));

    await cron.sweepDaily();

    expect(payments.reconcilePendingPayments).toHaveBeenCalledTimes(1);
    expect(payments.reconcileRefunds).toHaveBeenCalledTimes(1);
    expect(payments.releaseStaleHolds).toHaveBeenCalledTimes(1);
  });

  it('keeps going when one sweep throws, so a reconciliation error never blocks hold release', async () => {
    const payments = makePayments();
    payments.reconcilePendingPayments.mockRejectedValueOnce(new Error('provider down'));
    const cron = new PaymentsMaintenanceCron(payments, makeCfg(20));

    await expect(cron.runSweeps('manual')).resolves.toBeUndefined();
    expect(payments.releaseStaleHolds).toHaveBeenCalledTimes(1);
  });
});
