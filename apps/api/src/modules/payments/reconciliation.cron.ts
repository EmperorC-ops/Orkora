import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';

/**
 * Periodic payment reconciliation. Re-checks recent pending orders against their
 * provider and settles any that succeeded but whose webhook + verify-on-return
 * were both missed, and surfaces drift via logs for alerting. Runs ahead of the
 * stale-hold TTL so paid customers are settled promptly. In-process Nest
 * scheduler for now; swap for a BullMQ job if volume demands.
 */
@Injectable()
export class ReconciliationCron {
  private readonly logger = new Logger(ReconciliationCron.name);

  constructor(private readonly payments: PaymentsService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcile(): Promise<void> {
    try {
      await this.payments.reconcilePendingPayments();
    } catch (err) {
      this.logger.warn({ err }, 'Reconciliation iteration failed');
    }
  }
}
