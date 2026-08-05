import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';

/**
 * Periodic payment + refund reconciliation. Re-checks recent pending orders
 * against their provider and settles any that succeeded but whose webhook +
 * verify-on-return were both missed, then does the same for refunds in flight
 * (refund webhook + synchronous result both missed). Surfaces drift via logs
 * for alerting. Runs ahead of the stale-hold TTL so paid customers are settled
 * promptly. In-process Nest scheduler for now; swap for a BullMQ job if volume
 * demands.
 */
@Injectable()
export class ReconciliationCron {
  private readonly logger = new Logger(ReconciliationCron.name);

  constructor(private readonly payments: PaymentsService) {}

  // Env-tunable via RECONCILIATION_CRON; default every 30 min (was every 10).
  // This only settles doubly-missed paid orders sooner; it is NOT the safety net
  // (releaseStaleHolds verifies each order with the provider before releasing).
  // Widened so an idle API stops waking Neon and its compute can scale to zero.
  @Cron(process.env.RECONCILIATION_CRON || CronExpression.EVERY_30_MINUTES)
  async reconcile(): Promise<void> {
    try {
      await this.payments.reconcilePendingPayments();
    } catch (err) {
      this.logger.warn({ err }, 'Payment reconciliation iteration failed');
    }
    try {
      await this.payments.reconcileRefunds();
    } catch (err) {
      this.logger.warn({ err }, 'Refund reconciliation iteration failed');
    }
  }
}
