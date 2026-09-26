/**
 * Platform fee schedule (single source of truth).
 *
 * The fee structure is 3% PLUS a flat 0.99 USD per paid ticket. It is introduced
 * by scheduling it here, not by a code change to the money path. Every event is
 * stamped with `platformFeeAt(createdAt)` when it is created, and it keeps that
 * fee for its whole life, which is how the grandfathering promise in the Terms
 * of Service (sections 4 and 7) is honored.
 *
 * Everything here is environment-driven so the fee can be scheduled per
 * environment (test / staging first) without a code change, and stays off in
 * production until deliberately set. All defaults leave the fee off.
 *
 * Turn-on procedure (do NOT do this in production until the 60-day written
 * notice to organizers has run and the legal prerequisites are closed):
 *   1. Set env PLATFORM_FEE_EFFECTIVE_AT to the effective date (ISO 8601), at
 *      least 60 days after the notice was sent.
 *   2. From that date, new events are created at the planned fee; every event
 *      created before it stays at zero until it ends.
 *
 * Env vars (all optional):
 *   PLATFORM_FEE_EFFECTIVE_AT   ISO date the fee starts applying. Unset = never
 *                               scheduled, so the effective fee is zero.
 *   PLATFORM_FEE_BPS            percentage in basis points (default 300 = 3%).
 *   PLATFORM_FEE_FLAT_MINOR     base flat fee per paid ticket (default 99).
 *   PLATFORM_FEE_FLAT_CURRENCY  currency of the base flat fee (default USD).
 *   PLATFORM_FEE_FLAT_<CUR>     per-settlement-currency flat amount in that
 *                               currency's minor units, e.g.
 *                               PLATFORM_FEE_FLAT_NGN=15000 for 150.00 NGN.
 *                               A currency with no configured amount has no flat
 *                               fee (only the percentage applies), so no
 *                               exchange rate is ever invented.
 */

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** Percentage component, in basis points. 300 bps = 3.00%. */
export const PLANNED_PLATFORM_FEE_BPS = intEnv('PLATFORM_FEE_BPS', 300);

/** Flat per-paid-ticket component, in minor units of the currency below. */
export const PLANNED_PLATFORM_FEE_FLAT_MINOR = intEnv('PLATFORM_FEE_FLAT_MINOR', 99); // 0.99

/** Currency the flat component is denominated in. */
export const PLANNED_PLATFORM_FEE_FLAT_CURRENCY = (
  process.env.PLATFORM_FEE_FLAT_CURRENCY || 'USD'
).toUpperCase();

/**
 * The date the planned fee starts applying to newly created events. `null` means
 * the fee is not scheduled yet (or the env value is not a valid date), so the
 * effective fee is zero.
 */
export const PLATFORM_FEE_EFFECTIVE_AT: Date | null = (() => {
  const raw = process.env.PLATFORM_FEE_EFFECTIVE_AT;
  if (!raw || raw.trim() === '') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
})();

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
 * Flat per-ticket fee expressed in each settlement currency's minor units.
 * Seeded with the base flat fee in its own currency, then merged with any
 * PLATFORM_FEE_FLAT_<CUR> env overrides. A currency not listed here has no flat
 * fee, so we never invent an exchange rate. Operators set an env var per
 * settlement currency when the fee is scheduled (for example
 * PLATFORM_FEE_FLAT_NGN for Paystack NGN settlements).
 */
export const PLATFORM_FEE_FLAT_BY_CURRENCY: Record<string, number> = (() => {
  const map: Record<string, number> = {
    [PLANNED_PLATFORM_FEE_FLAT_CURRENCY]: PLANNED_PLATFORM_FEE_FLAT_MINOR,
  };
  for (const [key, value] of Object.entries(process.env)) {
    const m = /^PLATFORM_FEE_FLAT_([A-Z]{3})$/.exec(key);
    if (!m || value === undefined || value.trim() === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) map[m[1]] = Math.trunc(n);
  }
  return map;
})();

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
 * Refund policy for the platform fee.
 *
 * true (the policy) means a full refund returns the platform fee too, so Orkora
 * keeps nothing on a refunded order. This is the only policy consistent with
 * always refunding the buyer what they paid: in pass-on mode the buyer paid the
 * fee, so a full refund must return it. Refunded orders are also excluded from
 * fee revenue in billing, which matches this.
 */
export const PLATFORM_FEE_REFUNDABLE = true;

/**
 * The money movement of a full refund, in the order's currency (minor units):
 *   - buyerRefundMinor: what the buyer gets back, always the full order total
 *     (which already includes the fee when the organizer passed it on).
 *   - platformFeeReturnedMinor: the platform fee the platform gives back, the
 *     whole fee under the current policy.
 */
export function refundBreakdownMinor(input: {
  totalMinor: bigint;
  feesMinor: bigint;
}): { buyerRefundMinor: bigint; platformFeeReturnedMinor: bigint } {
  return {
    buyerRefundMinor: input.totalMinor,
    platformFeeReturnedMinor: PLATFORM_FEE_REFUNDABLE ? input.feesMinor : 0n,
  };
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
