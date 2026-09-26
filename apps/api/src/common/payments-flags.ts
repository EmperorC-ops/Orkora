/**
 * Payments feature flags, in a neutral location so both the payments module and
 * the registrations module can read them without importing across module
 * boundaries.
 */

/**
 * Connected-accounts / platform-fee gate. Off by default. When '1', paid orders
 * carry the platform fee (routed to the organizer's connected account as a
 * split) and organizers must have a ready payout account to sell paid tickets.
 * Turned on alongside the platform fee going live (see PLATFORM_FEE_ROLLOUT.md).
 */
export function connectedAccountsEnabled(): boolean {
  return process.env.PAYMENTS_CONNECTED_ACCOUNTS === '1';
}
