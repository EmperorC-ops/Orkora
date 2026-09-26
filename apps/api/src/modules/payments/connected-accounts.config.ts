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
