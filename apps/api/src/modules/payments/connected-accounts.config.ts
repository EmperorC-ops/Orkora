/**
 * Connected-accounts gate configuration.
 *
 * The gate flag itself lives in common/payments-flags.ts so the registrations
 * module can read it too; it is re-exported here so existing imports keep
 * working. When enabled, a paid checkout requires the organization to have an
 * active connected payout account for the resolved provider, so funds settle to
 * the organizer and the platform fee can be taken as a split. Off by default.
 */
export { connectedAccountsEnabled } from '../../common/payments-flags';

/**
 * Pure readiness check for a stored account row. An account is ready to receive
 * a split only when it is active and the provider reports charges enabled.
 */
export function accountIsReady(row: {
  status: string;
  chargesEnabled: boolean;
}): boolean {
  return row.status === 'active' && row.chargesEnabled === true;
}

/**
 * Providers whose checkout can consume the split fields on CreateCheckoutInput
 * (`subaccountCode` + `platformFeeMinor`) and actually route the organizer's
 * share to their connected account while keeping the platform fee.
 *
 * A provider is only added here once its createCheckoutSession wires the split;
 * for anything else the fields would be silently ignored and the whole payment
 * would settle centrally with no fee taken, so the checkout guard must not
 * attempt a split for it. Stripe is deliberately absent: Stripe Connect is not
 * being built (decision 2026-10-07, see STRIPE_FLUTTERWAVE_SPLIT_SCOPE.md).
 */
const SPLIT_CAPABLE_PROVIDERS = new Set<string>(['paystack', 'flutterwave']);

export function providerSupportsSplit(providerName: string): boolean {
  return SPLIT_CAPABLE_PROVIDERS.has(providerName);
}
