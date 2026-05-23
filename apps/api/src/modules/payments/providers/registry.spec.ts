import { BadRequestException } from '@nestjs/common';
import { PaymentsRegistry } from './registry';
import type { PaymentMethodName, PaymentProvider } from './types';

/**
 * Locks the currency -> provider routing contract. The live USD/Stripe smoke
 * test depends on `pickForCurrency('USD')` returning 'stripe' when Stripe is
 * enabled; if it ever silently fell back to Paystack we would be testing the
 * wrong provider. African-market currencies must prefer Paystack.
 */

// Real supported-currency lists, kept in sync with the concrete providers so
// the routing assertions reflect production behaviour.
const STRIPE_CCY = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NGN', 'ZAR'];
const PAYSTACK_CCY = ['NGN', 'GHS', 'ZAR', 'KES', 'USD'];
const FLUTTERWAVE_CCY = ['NGN', 'USD', 'GHS', 'KES', 'ZAR', 'XAF', 'XOF'];

function fakeProvider(
  name: PaymentMethodName,
  enabled: boolean,
  supportedCurrencies: readonly string[],
): PaymentProvider {
  return {
    name,
    enabled,
    supportedCurrencies,
    createCheckoutSession: jest.fn(),
    parseAndVerifyWebhook: jest.fn(),
    refund: jest.fn(),
    verifyTransaction: jest.fn(),
  } as unknown as PaymentProvider;
}

function makeRegistry(opts?: {
  stripe?: boolean;
  paystack?: boolean;
  flutterwave?: boolean;
}): PaymentsRegistry {
  const stripe = fakeProvider('stripe', opts?.stripe ?? true, STRIPE_CCY);
  const paystack = fakeProvider('paystack', opts?.paystack ?? true, PAYSTACK_CCY);
  const flutterwave = fakeProvider('flutterwave', opts?.flutterwave ?? true, FLUTTERWAVE_CCY);
  return new PaymentsRegistry(
    stripe as never,
    paystack as never,
    flutterwave as never,
  );
}

describe('PaymentsRegistry.pickForCurrency', () => {
  it('routes USD to Stripe when Stripe is enabled (the live-test contract)', () => {
    expect(makeRegistry().pickForCurrency('USD')).toBe('stripe');
  });

  it('is case-insensitive on the currency code', () => {
    expect(makeRegistry().pickForCurrency('usd')).toBe('stripe');
  });

  it('routes NGN to Paystack (African-market preference)', () => {
    expect(makeRegistry().pickForCurrency('NGN')).toBe('paystack');
  });

  it('routes GHS/KES to Paystack', () => {
    const r = makeRegistry();
    expect(r.pickForCurrency('GHS')).toBe('paystack');
    expect(r.pickForCurrency('KES')).toBe('paystack');
  });

  it('routes EUR to Stripe (only Stripe supports it)', () => {
    expect(makeRegistry().pickForCurrency('EUR')).toBe('stripe');
  });

  it('routes XAF to Flutterwave (Paystack does not support it)', () => {
    expect(makeRegistry().pickForCurrency('XAF')).toBe('flutterwave');
  });

  it('falls back to Paystack for USD when Stripe and Flutterwave are off', () => {
    // This is the failure mode the live test must avoid: if the Stripe key
    // were missing, a USD tier would silently route to Paystack.
    const r = makeRegistry({ stripe: false, flutterwave: false });
    expect(r.pickForCurrency('USD')).toBe('paystack');
  });

  it('returns null when no provider is configured', () => {
    const r = makeRegistry({ stripe: false, paystack: false, flutterwave: false });
    expect(r.pickForCurrency('USD')).toBeNull();
  });

  it('falls back to any enabled provider for an unsupported currency', () => {
    // JPY is supported by none of the three; pickForCurrency returns the first
    // enabled provider rather than null so checkout can still be attempted.
    const r = makeRegistry({ stripe: true, paystack: false, flutterwave: false });
    expect(r.pickForCurrency('JPY')).toBe('stripe');
  });
});

describe('PaymentsRegistry.getEnabledNames / resolve / has', () => {
  it('lists only enabled providers', () => {
    const r = makeRegistry({ stripe: true, paystack: true, flutterwave: false });
    expect(r.getEnabledNames().sort()).toEqual(['paystack', 'stripe']);
  });

  it('resolve() throws for an unknown provider', () => {
    const r = makeRegistry();
    expect(() => r.resolve('mtn' as PaymentMethodName)).toThrow(BadRequestException);
  });

  it('resolve() throws for a known-but-disabled provider', () => {
    const r = makeRegistry({ flutterwave: false });
    expect(() => r.resolve('flutterwave')).toThrow(BadRequestException);
  });

  it('resolve() returns the provider when enabled', () => {
    const r = makeRegistry();
    expect(r.resolve('stripe').name).toBe('stripe');
  });

  it('has() reflects enabled state', () => {
    const r = makeRegistry({ flutterwave: false });
    expect(r.has('stripe')).toBe(true);
    expect(r.has('flutterwave')).toBe(false);
    expect(r.has('mtn' as PaymentMethodName)).toBe(false);
  });
});
