import {
  PLANNED_PLATFORM_FEE_BPS,
  PLATFORM_FEE_EFFECTIVE_AT,
  feeBpsForSchedule,
  platformFeeBpsAt,
} from './platform-fee';

describe('platform fee schedule', () => {
  const rate = 300;

  it('is 0 when the fee is not scheduled (effectiveAt null)', () => {
    expect(feeBpsForSchedule(new Date('2026-09-26'), null, rate)).toBe(0);
  });

  it('is 0 before the effective date', () => {
    const effectiveAt = new Date('2026-12-01T00:00:00Z');
    expect(feeBpsForSchedule(new Date('2026-11-30T23:59:59Z'), effectiveAt, rate)).toBe(0);
  });

  it('is the full rate on and after the effective date', () => {
    const effectiveAt = new Date('2026-12-01T00:00:00Z');
    expect(feeBpsForSchedule(new Date('2026-12-01T00:00:00Z'), effectiveAt, rate)).toBe(rate);
    expect(feeBpsForSchedule(new Date('2027-01-15T00:00:00Z'), effectiveAt, rate)).toBe(rate);
  });

  it('current live config charges nothing (fee not scheduled yet)', () => {
    // Guard against an accidental turn-on: until the fee is deliberately
    // scheduled, every new event must be stamped 0.
    expect(PLATFORM_FEE_EFFECTIVE_AT).toBeNull();
    expect(platformFeeBpsAt(new Date())).toBe(0);
    expect(PLANNED_PLATFORM_FEE_BPS).toBe(300);
  });
});
