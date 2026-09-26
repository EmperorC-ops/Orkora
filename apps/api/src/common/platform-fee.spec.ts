import {
  PLANNED_PLATFORM_FEE_BPS,
  PLANNED_PLATFORM_FEE_FLAT_MINOR,
  PLANNED_PLATFORM_FEE_FLAT_CURRENCY,
  PLATFORM_FEE_EFFECTIVE_AT,
  computePlatformFeeMinor,
  feeForSchedule,
  flatFeeMinorForCurrency,
  platformFeeAt,
  platformFeeBpsAt,
  type PlatformFee,
} from './platform-fee';

describe('platform fee schedule', () => {
  const planned: PlatformFee = { bps: 300, flatMinor: 99, flatCurrency: 'USD' };

  it('is zero when the fee is not scheduled (effectiveAt null)', () => {
    expect(feeForSchedule(new Date('2026-09-26'), null, planned)).toEqual({
      bps: 0,
      flatMinor: 0,
      flatCurrency: null,
    });
  });

  it('is zero before the effective date', () => {
    const effectiveAt = new Date('2026-12-01T00:00:00Z');
    expect(feeForSchedule(new Date('2026-11-30T23:59:59Z'), effectiveAt, planned)).toEqual({
      bps: 0,
      flatMinor: 0,
      flatCurrency: null,
    });
  });

  it('is the full fee (percentage + flat per ticket) on and after the effective date', () => {
    const effectiveAt = new Date('2026-12-01T00:00:00Z');
    expect(feeForSchedule(new Date('2026-12-01T00:00:00Z'), effectiveAt, planned)).toEqual(planned);
    expect(feeForSchedule(new Date('2027-01-15T00:00:00Z'), effectiveAt, planned)).toEqual(planned);
  });

  it('planned pricing is 3% plus 0.99 USD per paid ticket', () => {
    expect(PLANNED_PLATFORM_FEE_BPS).toBe(300);
    expect(PLANNED_PLATFORM_FEE_FLAT_MINOR).toBe(99);
    expect(PLANNED_PLATFORM_FEE_FLAT_CURRENCY).toBe('USD');
  });

  it('current live config charges nothing (fee not scheduled yet)', () => {
    // Guard against an accidental turn-on: until the fee is deliberately
    // scheduled, every new event must be stamped with a zero fee.
    expect(PLATFORM_FEE_EFFECTIVE_AT).toBeNull();
    expect(platformFeeAt(new Date())).toEqual({ bps: 0, flatMinor: 0, flatCurrency: null });
    expect(platformFeeBpsAt(new Date())).toBe(0);
  });
});

describe('computePlatformFeeMinor', () => {
  it('is zero when the stamped fee is zero (every event today)', () => {
    const r = computePlatformFeeMinor({
      subtotalMinor: 500000,
      orderCurrency: 'NGN',
      ticketCount: 5,
      bps: 0,
      flatMinor: 0,
      flatCurrency: null,
    });
    expect(r.feeMinor).toBe(0);
  });

  it('applies 3% plus the flat fee per ticket when order and flat currency match', () => {
    // 10.00 USD subtotal, 2 tickets: 3% = 30 minor, flat 99 * 2 = 198 minor.
    const r = computePlatformFeeMinor({
      subtotalMinor: 1000,
      orderCurrency: 'USD',
      ticketCount: 2,
      bps: 300,
      flatMinor: 99,
      flatCurrency: 'USD',
    });
    expect(r.feeMinor).toBe(30 + 198);
    expect(r.flatApplied).toBe(true);
  });

  it('applies the percentage but skips the flat fee for a currency with no configured flat amount', () => {
    // NGN has no configured flat amount by default, so only the 3% applies and
    // flatApplied is false so the caller can log it.
    const r = computePlatformFeeMinor({
      subtotalMinor: 1000000,
      orderCurrency: 'NGN',
      ticketCount: 3,
      bps: 300,
      flatMinor: 99,
      flatCurrency: 'USD',
    });
    expect(r.feeMinor).toBe(30000);
    expect(r.flatApplied).toBe(false);
  });

  it('flatFeeMinorForCurrency is null for an unconfigured currency and set for USD', () => {
    expect(flatFeeMinorForCurrency('NGN', 3)).toBeNull();
    expect(flatFeeMinorForCurrency('USD', 3)).toBe(99 * 3);
  });
});
