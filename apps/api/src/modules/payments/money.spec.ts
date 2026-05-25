import {
  currencyDecimals,
  toMajor,
  toMajorUnit,
  toSmallestUnit,
  ZERO_DECIMAL_CURRENCIES,
  THREE_DECIMAL_CURRENCIES,
} from './money';

/**
 * Locks the canonical-amount -> provider-amount conversions. The canonical
 * store is major*100 for every currency; these tests prove the conversion is
 * correct per currency so adding a zero-decimal (XAF/XOF) or three-decimal (TND)
 * currency cannot silently 100x or mis-scale a charge.
 */

describe('currencyDecimals', () => {
  it('defaults to 2 for standard currencies', () => {
    for (const c of ['USD', 'NGN', 'GHS', 'KES', 'ZAR', 'EUR', 'GBP']) {
      expect(currencyDecimals(c)).toBe(2);
    }
  });

  it('returns 0 for zero-decimal currencies (XAF/XOF and friends)', () => {
    for (const c of ['XAF', 'XOF', 'JPY']) expect(currencyDecimals(c)).toBe(0);
  });

  it('returns 3 for three-decimal currencies', () => {
    for (const c of ['TND', 'KWD', 'BHD']) expect(currencyDecimals(c)).toBe(3);
  });

  it('is case-insensitive', () => {
    expect(currencyDecimals('xaf')).toBe(0);
    expect(currencyDecimals('usd')).toBe(2);
  });
});

describe('toSmallestUnit (Stripe unit_amount / Paystack amount)', () => {
  it('passes 2-decimal currencies through unchanged (major*100 already equals cents)', () => {
    expect(toSmallestUnit(2000, 'USD')).toBe(2000); // $20.00
    expect(toSmallestUnit(500000, 'NGN')).toBe(500000); // NGN 5,000.00
    expect(toSmallestUnit(150, 'ZAR')).toBe(150); // R1.50
  });

  it('divides zero-decimal currencies back to major (prevents the 100x overcharge)', () => {
    expect(toSmallestUnit(100000, 'XAF')).toBe(1000); // 1,000 XAF
    expect(toSmallestUnit(100000, 'XOF')).toBe(1000);
    expect(toSmallestUnit(500000, 'JPY')).toBe(5000);
  });

  it('scales three-decimal currencies up by 10', () => {
    expect(toSmallestUnit(100000, 'TND')).toBe(1000000); // 1,000.000 TND in millimes
  });

  it('accepts bigint (order.totalMinor is bigint)', () => {
    expect(toSmallestUnit(2000n, 'USD')).toBe(2000);
    expect(toSmallestUnit(100000n, 'XAF')).toBe(1000);
  });
});

describe('toMajorUnit (Flutterwave amount)', () => {
  it('returns the major value for any currency', () => {
    expect(toMajorUnit(2000)).toBe(20);
    expect(toMajorUnit(100000)).toBe(1000); // works for XAF and 2-decimal alike
    expect(toMajorUnit(500000n)).toBe(5000);
  });
});

describe('toMajor', () => {
  it('divides the canonical amount by 100', () => {
    expect(toMajor(2050)).toBe(20.5);
    expect(toMajor(0)).toBe(0);
  });
});

describe('currency sets', () => {
  it('zero-decimal and three-decimal sets are disjoint', () => {
    for (const c of ZERO_DECIMAL_CURRENCIES) {
      expect(THREE_DECIMAL_CURRENCIES.has(c)).toBe(false);
    }
  });
});
