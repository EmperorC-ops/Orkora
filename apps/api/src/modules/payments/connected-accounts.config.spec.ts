import {
  accountIsReady,
  connectedAccountsEnabled,
  providerSupportsSplit,
} from './connected-accounts.config';

describe('connected-accounts gate config', () => {
  const original = process.env.PAYMENTS_CONNECTED_ACCOUNTS;
  afterEach(() => {
    if (original === undefined) delete process.env.PAYMENTS_CONNECTED_ACCOUNTS;
    else process.env.PAYMENTS_CONNECTED_ACCOUNTS = original;
  });

  it('is off by default and off for anything other than "1"', () => {
    delete process.env.PAYMENTS_CONNECTED_ACCOUNTS;
    expect(connectedAccountsEnabled()).toBe(false);
    process.env.PAYMENTS_CONNECTED_ACCOUNTS = '0';
    expect(connectedAccountsEnabled()).toBe(false);
    process.env.PAYMENTS_CONNECTED_ACCOUNTS = 'true';
    expect(connectedAccountsEnabled()).toBe(false);
  });

  it('is on only when set to exactly "1"', () => {
    process.env.PAYMENTS_CONNECTED_ACCOUNTS = '1';
    expect(connectedAccountsEnabled()).toBe(true);
  });

  it('an account is ready only when active and charges are enabled', () => {
    expect(accountIsReady({ status: 'active', chargesEnabled: true })).toBe(true);
    expect(accountIsReady({ status: 'active', chargesEnabled: false })).toBe(false);
    expect(accountIsReady({ status: 'pending', chargesEnabled: true })).toBe(false);
    expect(accountIsReady({ status: 'disabled', chargesEnabled: true })).toBe(false);
  });

  // The checkout split is only attempted for providers that wire it. Stripe is
  // excluded on purpose (Stripe Connect is not being built), and an unknown
  // name must never be treated as split-capable.
  it('only Paystack and Flutterwave are split-capable', () => {
    expect(providerSupportsSplit('paystack')).toBe(true);
    expect(providerSupportsSplit('flutterwave')).toBe(true);
    expect(providerSupportsSplit('stripe')).toBe(false);
    expect(providerSupportsSplit('')).toBe(false);
    expect(providerSupportsSplit('PAYSTACK')).toBe(false);
  });
});
