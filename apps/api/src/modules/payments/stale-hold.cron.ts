import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';

/**
 * Releases pending orders that exceed `ORDER_HOLD_TTL_MIN` (default 20 min).
 * Runs via the in-process Nest scheduler (no external worker, no Redis queue).
 *
 * Interval is env-tunable via STALE_HOLD_CRON; default every 15 minutes. It was
 * every minute, which meant this query hit Postgres 24/7 and kept Neon compute
 * from ever scaling to zero (the main driver of idle DB cost). Widening is safe:
 * the sweep only touches orders already older than the TTL, and it verifies each
 * against the payment provider before releasing (see releaseStaleHolds), so a
 * paid-but-unsettled order is recovered, never wrongly cancelled. A longer
 * interval only delays freeing abandoned holds by a few minutes.
 * For very large traffic we will swap this for a BullMQ job queue.
 */
@Injectable()
export class StaleHoldCron {
  private readonly logger = new Logger(StaleHoldCron.name);

  constructor(private readonly payments: PaymentsService) {}

  @Cron(process.env.STALE_HOLD_CRON || '*/15 * * * *')
  async release(): Promise<void> {
    try {
      await this.payments.releaseStaleHolds();
    } catch (err) {
      this.logger.warn({ err }, 'Stale-hold release iteration failed');
    }
  }
}
