/**
 * Connected-accounts gate configuration.
 *
 * When enabled, a paid checkout requires the organization to have an active
 * connected payout account for the resolved provider, so funds settle to the
 * organizer and the platform fee can be taken as a split. This is turned on
 * alongside the platform fee going live (see PLATFORM_FEE_ROLLOUT.md).
 *
 * Off by default, so behavior is unchanged until it is deliberately enabled by
 * setting PAYMENTS_CONNECTED_ACCOUNTS=1 on the API deploy.
 */
export function connectedAccountsEnabled(): boolean {
  return process.env.PAYMENTS_CONNECTED_ACCOUNTS === '1';
}

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
