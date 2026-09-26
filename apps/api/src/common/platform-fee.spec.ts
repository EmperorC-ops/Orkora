import {
  PLANNED_PLATFORM_FEE_BPS,
  PLANNED_PLATFORM_FEE_FLAT_MINOR,
  PLANNED_PLATFORM_FEE_FLAT_CURRENCY,
  PLATFORM_FEE_EFFECTIVE_AT,
  feeForSchedule,
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
