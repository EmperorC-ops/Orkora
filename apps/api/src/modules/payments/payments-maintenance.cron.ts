import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { orderActivity } from '../../common/order-activity';
import { PaymentsService } from './payments.service';

/**
 * Payment maintenance sweeps (stale-hold release + payment/refund reconciliation),
 * scheduled so that an idle API never wakes the database.
 *
 * Two schedules:
 *  1. Every 15 minutes (PAYMENTS_SWEEP_CRON), but ONLY if an order was created or
 *     moved through checkout in this process within the last
 *     ORDER_HOLD_TTL_MIN + 30 minutes. With no recent orders there is nothing
 *     pending to release or reconcile, so the sweep returns without touching
 *     Postgres and Neon's compute is free to suspend.
 *  2. Once a day (PAYMENTS_DAILY_SWEEP_CRON, default 04:00 UTC) unconditionally,
 *     to catch anything a restart made the in-memory activity record forget.
 *
 * Both sweeps are idempotent and verify-before-fail (see PaymentsService), so a
 * paid-but-unsettled order is recovered rather than cancelled whichever pass
 * finds it. Replaces the former StaleHoldCron (15 min) and ReconciliationCron
 * (30 min), which between them kept the database awake around the clock.
 */
@Injectable()
export class PaymentsMaintenanceCron {
  private readonly logger = new Logger(PaymentsMaintenanceCron.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly cfg: ConfigService,
  ) {}

  /** Activity window: hold TTL plus a margin so the last hold of a burst is still swept. */
  private activityWindowMs(): number {
    const ttlMin = Number(this.cfg.get<number>('ORDER_HOLD_TTL_MIN') ?? 20);
    return (ttlMin + 30) * 60_000;
  }

  @Cron(process.env.PAYMENTS_SWEEP_CRON || '*/15 * * * *')
  async sweepIfActive(): Promise<void> {
    if (!orderActivity.activeWithin(this.activityWindowMs())) {
      return; // idle: no query, database stays asleep
    }
    await this.runSweeps('activity');
  }

  @Cron(process.env.PAYMENTS_DAILY_SWEEP_CRON || '0 4 * * *')
  async sweepDaily(): Promise<void> {
    await this.runSweeps('daily');
  }

  /** Exposed for tests and for a manual trigger. */
  async runSweeps(reason: 'activity' | 'daily' | 'manual'): Promise<void> {
    try {
      await this.payments.reconcilePendingPayments();
    } catch (err) {
      this.logger.warn({ err, reason }, 'Payment reconciliation sweep failed');
    }
    try {
      await this.payments.reconcileRefunds();
    } catch (err) {
      this.logger.warn({ err, reason }, 'Refund reconciliation sweep failed');
    }
    try {
      await this.payments.releaseStaleHolds();
    } catch (err) {
      this.logger.warn({ err, reason }, 'Stale-hold release sweep failed');
    }
  }
}
