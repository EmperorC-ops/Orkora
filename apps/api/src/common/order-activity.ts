/**
 * In-process record of the last time an order was created or moved through
 * checkout. The payment maintenance sweeps consult it so they only touch
 * Postgres when there is plausibly something to sweep.
 *
 * Why: Neon suspends its compute after 5 idle minutes. A sweep that queries the
 * database every 15 minutes therefore keeps the compute billing 24 hours a day
 * even when the platform has no orders at all (measured: ~186 CU-hours a month
 * at the 0.25 CU floor). Gating the sweep on real activity lets an idle API
 * leave the database asleep, while a busy API still sweeps every 15 minutes.
 *
 * The record lives in memory, so a restart forgets it; the daily unconditional
 * sweep in PaymentsMaintenanceCron covers anything left behind.
 */
class OrderActivity {
  private lastAt = 0;

  /** Call whenever an order is created or advanced through checkout. */
  touch(): void {
    this.lastAt = Date.now();
  }

  /** True when an order was touched within the last `ms` milliseconds. */
  activeWithin(ms: number): boolean {
    return this.lastAt > 0 && Date.now() - this.lastAt < ms;
  }

  /** Test helper. */
  reset(): void {
    this.lastAt = 0;
  }
}

export const orderActivity = new OrderActivity();
