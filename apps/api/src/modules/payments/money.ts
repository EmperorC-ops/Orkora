/**
 * Money convention (single source of truth).
 *
 * Orkora stores every amount as `amountMinor` = the major-currency value times
 * 100, for ALL currencies, regardless of the currency's real ISO-4217 minor
 * unit count. (The web computes `priceMinor = Math.round(price * 100)` and
 * displays with `Intl.NumberFormat(currency)` over `value / 100`, which renders
 * the right number of decimals per currency.)
 *
 * Providers expect different shapes:
 *   - Stripe `unit_amount` and Paystack `amount`: the smallest currency unit,
 *     i.e. major * 10^isoDecimals.
 *   - Flutterwave `amount`: major units.
 *
 * For 2-decimal currencies (USD, NGN, GHS, KES, ZAR, EUR, ...) major*100 already
 * equals the smallest unit, so a blind passthrough happens to work. It breaks
 * for zero-decimal (XAF, XOF, ...) and three-decimal (TND, ...) currencies. This
 * module does the conversion correctly so adding a currency can never silently
 * 100x (or /10) a charge.
 */

/** amountMinor = major * AMOUNT_SCALE. */
export const AMOUNT_SCALE = 100;

/** ISO-4217 currencies with zero minor units (no subdivision). */
export const ZERO_DECIMAL_CURRENCIES = new Set([
  'XAF', 'XOF', 'XPF', 'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV',
]);

/** ISO-4217 currencies with three minor units. */
export const THREE_DECIMAL_CURRENCIES = new Set([
  'BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND',
]);

/** Real ISO-4217 minor-unit exponent for a currency (defaults to 2). */
export function currencyDecimals(currency: string): 0 | 2 | 3 {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(c)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(c)) return 3;
  return 2;
}

/** Major-unit value of a canonical amount (e.g. 2000 -> 20, 100000 XAF -> 1000). */
export function toMajor(amountMinor: bigint | number): number {
  return Number(amountMinor) / AMOUNT_SCALE;
}

/**
 * Integer amount in the provider's smallest currency unit (Stripe `unit_amount`,
 * Paystack `amount`): major * 10^isoDecimals.
 *   - 2-decimal: equals amountMinor (unchanged behaviour)
 *   - 0-decimal: amountMinor / 100
 *   - 3-decimal: amountMinor * 10
 */
export function toSmallestUnit(amountMinor: bigint | number, currency: string): number {
  const decimals = currencyDecimals(currency);
  return Math.round(toMajor(amountMinor) * 10 ** decimals);
}

/**
 * Inverse of `toSmallestUnit`. Converts an amount the provider reported in its
 * smallest currency unit (Stripe `amount_total`, Paystack `data.amount`) back
 * into our canonical `amountMinor`. Used at settlement to compare what was
 * actually charged against `orders.total_minor`.
 *
 * Rounds to the nearest canonical minor unit: a zero-decimal currency has no
 * sub-major precision to lose, and a three-decimal currency is quantised to
 * 1/100 of a major unit, which is the resolution our ledger stores. Any real
 * discrepancy is therefore visible to the comparison rather than absorbed.
 */
export function fromSmallestUnit(value: number | bigint, currency: string): bigint {
  const decimals = currencyDecimals(currency);
  const major = Number(value) / 10 ** decimals;
  return BigInt(Math.round(major * AMOUNT_SCALE));
}

/** Inverse of `toMajorUnit`, for providers that report major units (Flutterwave). */
export function fromMajorUnit(value: number | bigint): bigint {
  return BigInt(Math.round(Number(value) * AMOUNT_SCALE));
}

/** Major-unit amount for providers that bill in major units (Flutterwave). */
export function toMajorUnit(amountMinor: bigint | number): number {
  return toMajor(amountMinor);
}

/**
 * Human-readable amount with the currency's correct decimals (e.g. "US$20.00",
 * "GHS 50", "FCFA 1,000" for zero-decimal XAF). Used for receipts/emails.
 */
export function formatMoney(amountMinor: bigint | number, currency: string): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(toMajor(amountMinor));
}
