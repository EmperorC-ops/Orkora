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

/**
 * Flat per-ticket fee expressed in each settlement currency's minor units. The
 * base fee is 0.99 USD. Any other currency must be listed here before the flat
 * fee applies to it, so we never invent an exchange rate. Operators fill this in
 * per currency when the fee is scheduled (for example an NGN kobo amount for
 * Paystack settlements). Until then only USD orders carry the flat fee.
 */
export const PLATFORM_FEE_FLAT_BY_CURRENCY: Record<string, number> = {
  USD: PLANNED_PLATFORM_FEE_FLAT_MINOR,
};

/**
 * The flat fee (minor units) for `ticketCount` paid tickets in a currency, or
 * null when that currency has no configured flat amount (so the caller can skip
 * it rather than guess a conversion).
 */
export function flatFeeMinorForCurrency(currency: string, ticketCount: number): number | null {
  const per = PLATFORM_FEE_FLAT_BY_CURRENCY[currency.toUpperCase()];
  if (per === undefined) return null;
  return per * Math.max(0, ticketCount);
}

/**
 * Compute the platform fee for an order in the order's own currency (minor
 * units): the percentage of the subtotal plus the flat amount per paid ticket.
 *
 * The percentage always applies. The flat amount applies directly when the order
 * currency matches the fee's flat currency, and otherwise from
 * PLATFORM_FEE_FLAT_BY_CURRENCY; if that currency has no configured flat amount,
 * the flat part is skipped and `flatApplied` is false so the caller can log it.
 */
export function computePlatformFeeMinor(input: {
  subtotalMinor: number;
  orderCurrency: string;
  ticketCount: number;
  bps: number;
  flatMinor: number;
  flatCurrency: string | null;
}): { feeMinor: number; flatApplied: boolean } {
  const pct = Math.floor((Math.max(0, input.subtotalMinor) * Math.max(0, input.bps)) / 10_000);
  let flat = 0;
  let flatApplied = true;
  if (input.flatMinor > 0) {
    const sameCurrency =
      input.flatCurrency &&
      input.orderCurrency.toUpperCase() === input.flatCurrency.toUpperCase();
    if (sameCurrency) {
      flat = input.flatMinor * Math.max(0, input.ticketCount);
    } else {
      const configured = flatFeeMinorForCurrency(input.orderCurrency, input.ticketCount);
      if (configured === null) {
        flat = 0;
        flatApplied = false;
      } else {
        flat = configured;
      }
    }
  }
  return { feeMinor: pct + flat, flatApplied };
}
