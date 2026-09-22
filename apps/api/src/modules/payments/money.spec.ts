import {
  currencyDecimals,
  formatMoney,
  fromMajorUnit,
  fromSmallestUnit,
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

describe('formatMoney (receipts/emails)', () => {
  it('formats 2-decimal currencies with two decimals', () => {
    expect(formatMoney(2000, 'USD')).toContain('20.00');
    expect(formatMoney(500000, 'NGN')).toContain('5,000.00');
  });

  it('formats zero-decimal currencies with no decimal places', () => {
    const xaf = formatMoney(100000, 'XAF');
    expect(xaf).toContain('1,000');
    expect(xaf).not.toContain('.00');
  });
});

/**
 * The inverses. These carry the settlement amount check, so a rounding error
 * here would either wave a short payment through or quarantine a correct one.
 * Round-tripping every supported currency class is the point.
 */
describe('provider amount -> canonical amount', () => {
  it('round-trips two-decimal currencies through the smallest unit', () => {
    for (const currency of ['NGN', 'USD', 'GHS', 'KES', 'EUR']) {
      const canonical = 123456n; // 1,234.56
      expect(fromSmallestUnit(toSmallestUnit(canonical, currency), currency)).toBe(canonical);
    }
  });

  it('round-trips zero-decimal currencies through the smallest unit', () => {
    for (const currency of ['XAF', 'XOF']) {
      const canonical = 100000n; // 1,000 whole units, no subdivision
      expect(toSmallestUnit(canonical, currency)).toBe(1000);
      expect(fromSmallestUnit(1000, currency)).toBe(canonical);
    }
  });

  it('round-trips three-decimal currencies through the smallest unit', () => {
    const canonical = 123456n; // 1,234.56
    expect(toSmallestUnit(canonical, 'TND')).toBe(1234560);
    expect(fromSmallestUnit(1234560, 'TND')).toBe(canonical);
  });

  it('round-trips major-unit providers (Flutterwave)', () => {
    const canonical = 500000n; // 5,000.00
    expect(toMajorUnit(canonical)).toBe(5000);
    expect(fromMajorUnit(5000)).toBe(canonical);
    expect(fromMajorUnit(4999.99)).toBe(499999n);
  });

  it('does not absorb a real shortfall into a rounding tolerance', () => {
    // One canonical minor unit short must stay one unit short, not round up.
    // This is the case the gate exists for: 4,999.99 against a 5,000.00 order.
    expect(fromSmallestUnit(499999, 'NGN')).toBe(499999n);
    expect(fromMajorUnit(4999.99)).toBe(499999n);
    expect(fromMajorUnit(4999.99)).toBeLessThan(500000n);
  });

  it('is case-insensitive on the currency code', () => {
    expect(fromSmallestUnit(1000, 'xaf')).toBe(fromSmallestUnit(1000, 'XAF'));
  });
});
