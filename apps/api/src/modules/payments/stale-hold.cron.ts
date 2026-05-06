import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';

/**
 * Releases pending orders that exceed `ORDER_HOLD_TTL_MIN`. Runs every minute
 * via the in-process Nest scheduler (no external worker, no Redis queue).
 * For very large traffic we will swap this for a BullMQ job queue.
 */
@Injectable()
export class StaleHoldCron {
  private readonly logger = new Logger(StaleHoldCron.name);

  constructor(private readonly payments: PaymentsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async release(): Promise<void> {
    try {
      await this.payments.releaseStaleHolds();
    } catch (err) {
      this.logger.warn({ err }, 'Stale-hold release iteration failed');
    }
  }
}
