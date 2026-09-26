/**
 * Platform fee schedule (single source of truth).
 *
 * The fee structure is 3% PLUS a flat 0.99 USD per paid ticket. It is introduced
 * by scheduling it here, not by a code change to the money path. Every event is
 * stamped with `platformFeeAt(createdAt)` when it is created, and it keeps that
 * fee for its whole life, which is how the grandfathering promise in the Terms
 * of Service (sections 4 and 7) is honored.
 *
 * Turn-on procedure (do NOT do this until the 60-day written notice to
 * organizers has run and the legal prerequisites are closed):
 *   1. Set PLATFORM_FEE_EFFECTIVE_AT to the effective date, at least 60 days
 *      after the notice was sent.
 *   2. Ship. From that date, new events are created at the planned fee; every
 *      event created before it stays at zero until it ends.
 *
 * While PLATFORM_FEE_EFFECTIVE_AT is null (today), the effective fee is zero and
 * nothing is charged.
 *
 * Open decision for a later slice: the flat fee is denominated in USD but events
 * sell in many currencies. Whether it is charged in USD or converted to the sale
 * currency at settlement is decided when the fee is actually implemented; the
 * currency is stored per event so that choice is not lost.
 */

/** Percentage component, in basis points. 300 bps = 3.00%. */
export const PLANNED_PLATFORM_FEE_BPS = 300;

/** Flat per-paid-ticket component, in minor units of the currency below. */
export const PLANNED_PLATFORM_FEE_FLAT_MINOR = 99; // 0.99

/** Currency the flat component is denominated in. */
export const PLANNED_PLATFORM_FEE_FLAT_CURRENCY = 'USD';

/**
 * The date the planned fee starts applying to newly created events. `null` means
 * the fee is not scheduled yet, so the effective fee is zero.
 */
export const PLATFORM_FEE_EFFECTIVE_AT: Date | null = null;

/** A resolved platform fee: percentage plus a flat per-ticket amount. */
export interface PlatformFee {
  /** Percentage component in basis points. */
  bps: number;
  /** Flat per-paid-ticket amount in minor units of `flatCurrency`. */
  flatMinor: number;
  /** Currency of `flatMinor`, or null when there is no flat fee. */
  flatCurrency: string | null;
}

const NO_FEE: PlatformFee = { bps: 0, flatMinor: 0, flatCurrency: null };

/**
 * Pure schedule resolver, extracted so the branch logic is testable without
 * depending on the module-level constants. Returns `planned` once `now` reaches
 * `effectiveAt`, otherwise a zero fee. A null `effectiveAt` means never
 * scheduled, so zero.
 */
export function feeForSchedule(
  now: Date,
  effectiveAt: Date | null,
  planned: PlatformFee,
): PlatformFee {
  if (effectiveAt && now.getTime() >= effectiveAt.getTime()) {
    return planned;
  }
  return { ...NO_FEE };
}

/**
 * The full platform fee in effect at a given moment. Zero until the fee is
 * scheduled and the effective date has passed.
 */
export function platformFeeAt(now: Date = new Date()): PlatformFee {
  return feeForSchedule(now, PLATFORM_FEE_EFFECTIVE_AT, {
    bps: PLANNED_PLATFORM_FEE_BPS,
    flatMinor: PLANNED_PLATFORM_FEE_FLAT_MINOR,
    flatCurrency: PLANNED_PLATFORM_FEE_FLAT_CURRENCY,
  });
}

/** Convenience: just the percentage component in effect now. */
export function platformFeeBpsAt(now: Date = new Date()): number {
  return platformFeeAt(now).bps;
}
