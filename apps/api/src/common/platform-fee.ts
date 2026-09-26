/**
 * Platform fee schedule (single source of truth).
 *
 * The platform fee is introduced by scheduling it here, not by a code change to
 * the money path. Every event is stamped with `platformFeeBpsAt(createdAt)` when
 * it is created, and it keeps that rate for its whole life, which is how the
 * grandfathering promise in the Terms of Service (sections 4 and 7) is honored.
 *
 * Turn-on procedure (do NOT do this until the 60-day written notice to
 * organizers has run and the legal prerequisites are closed):
 *   1. Set PLATFORM_FEE_EFFECTIVE_AT to the effective date, at least 60 days
 *      after the notice was sent.
 *   2. Ship. From that date, new events are created at PLANNED_PLATFORM_FEE_BPS;
 *      every event created before it stays at 0 until it ends.
 *
 * While PLATFORM_FEE_EFFECTIVE_AT is null (today), the effective rate is 0 and
 * nothing is charged.
 */

/** The rate that will apply once the fee is live. 300 bps = 3.00%. */
export const PLANNED_PLATFORM_FEE_BPS = 300;

/**
 * The date the planned rate starts applying to newly created events. `null`
 * means the fee is not scheduled yet, so the effective rate is 0.
 */
export const PLATFORM_FEE_EFFECTIVE_AT: Date | null = null;

/**
 * Pure schedule resolver, extracted so the branch logic is testable without
 * depending on the module-level constants. Returns `rate` once `now` reaches
 * `effectiveAt`, otherwise 0. A null `effectiveAt` means never scheduled, so 0.
 */
export function feeBpsForSchedule(
  now: Date,
  effectiveAt: Date | null,
  rate: number,
): number {
  if (effectiveAt && now.getTime() >= effectiveAt.getTime()) {
    return rate;
  }
  return 0;
}

/**
 * The platform fee rate (basis points) in effect at a given moment. Returns 0
 * until the fee is scheduled and the effective date has passed.
 */
export function platformFeeBpsAt(now: Date = new Date()): number {
  return feeBpsForSchedule(now, PLATFORM_FEE_EFFECTIVE_AT, PLANNED_PLATFORM_FEE_BPS);
}
