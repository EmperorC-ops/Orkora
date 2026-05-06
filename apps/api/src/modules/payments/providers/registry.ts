import { BadRequestException, Injectable } from '@nestjs/common';
import { FlutterwaveProvider } from './flutterwave.provider';
import { PaystackProvider } from './paystack.provider';
import { StripeProvider } from './stripe.provider';
import type { PaymentMethodName, PaymentProvider } from './types';

/**
 * Resolves a payment provider by name and exposes the list of providers that
 * are currently configured (have their env keys set). Also picks a sensible
 * default for a given tier currency.
 */
@Injectable()
export class PaymentsRegistry {
  private readonly providers: Map<PaymentMethodName, PaymentProvider>;

  constructor(
    stripe: StripeProvider,
    paystack: PaystackProvider,
    flutterwave: FlutterwaveProvider,
  ) {
    this.providers = new Map();
    this.providers.set(stripe.name, stripe);
    this.providers.set(paystack.name, paystack);
    this.providers.set(flutterwave.name, flutterwave);
  }

  getEnabledNames(): PaymentMethodName[] {
    return [...this.providers.values()].filter((p) => p.enabled).map((p) => p.name);
  }

  /** Throws BadRequestException with a clear message when the provider is unknown or disabled. */
  resolve(name: PaymentMethodName): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new BadRequestException(`Unknown payment provider: ${name}`);
    }
    if (!provider.enabled) {
      throw new BadRequestException(
        `Payment provider ${name} is not configured on this server. Add its env keys and restart.`,
      );
    }
    return provider;
  }

  has(name: PaymentMethodName): boolean {
    return this.providers.has(name) && (this.providers.get(name)?.enabled ?? false);
  }

  /**
   * Pick a default provider for the given tier currency. African-market
   * currencies prefer Paystack, then Flutterwave, then Stripe. Other
   * currencies prefer Stripe, then Flutterwave. Returns null if nothing is
   * configured.
   */
  pickForCurrency(currency: string): PaymentMethodName | null {
    const upper = currency.toUpperCase();
    const order: PaymentMethodName[] = ['NGN', 'GHS', 'ZAR', 'KES', 'XAF', 'XOF'].includes(upper)
      ? ['paystack', 'flutterwave', 'stripe']
      : ['stripe', 'flutterwave', 'paystack'];
    for (const name of order) {
      const p = this.providers.get(name);
      if (p?.enabled && p.supportedCurrencies.includes(upper)) return name;
    }
    // Fallback: any enabled provider.
    return this.getEnabledNames()[0] ?? null;
  }
}
