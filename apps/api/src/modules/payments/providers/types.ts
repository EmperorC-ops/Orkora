/**
 * Provider abstraction. Every concrete provider (Stripe, Paystack,
 * Flutterwave, ...) implements this surface. Adding a new provider only
 * requires writing a new file and registering it in the providers array of
 * `payments.module.ts`. Nothing else in the system needs to know about it.
 */

export type PaymentMethodName = 'stripe' | 'paystack' | 'flutterwave';

export interface CreateCheckoutInput {
  /** Our canonical order id, persisted so the webhook can resolve it back. */
  orderId: string;
  amountMinor: bigint;
  currency: string;
  customerEmail: string;
  description: string;
  /** Where the provider redirects on success. */
  successUrl: string;
  /** Where the provider redirects on cancel. */
  cancelUrl: string;
}

export interface CheckoutSession {
  /** Provider-side session id we persist as `orders.provider_ref`. */
  sessionId: string;
  /** Hosted-checkout URL the front end opens. */
  url: string;
}

export type WebhookOutcome =
  | { type: 'paid'; orderId: string; providerEventId: string; paidAt: Date }
  | { type: 'failed'; orderId: string; providerEventId: string; reason?: string }
  | { type: 'refunded'; orderId: string; providerEventId: string }
  | { type: 'ignored'; reason: string };

/**
 * Result of a synchronous transaction lookup, used by the verify-on-return
 * fallback so a delayed or missed webhook never leaves a paid customer without
 * a ticket.
 */
export interface TransactionStatus {
  status: 'success' | 'failed' | 'pending';
  paidAt?: Date;
  providerRef?: string;
}

export interface PaymentProvider {
  /** Stable name used in `orders.provider`. */
  readonly name: PaymentMethodName;

  /** True when env keys are present and the provider can run. */
  readonly enabled: boolean;

  /**
   * Currencies this provider is willing to charge. The registry uses this to
   * pick a default provider for a given tier currency when the caller does
   * not specify one explicitly.
   */
  readonly supportedCurrencies: readonly string[];

  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession>;

  /**
   * Verify the request signature against the raw body and parse it into a
   * canonical outcome. Throws when the signature is invalid; returns
   * `{ type: 'ignored' }` for events we do not care about.
   */
  parseAndVerifyWebhook(rawBody: Buffer, signatureHeader: string): Promise<WebhookOutcome>;

  /**
   * Issue a refund for a previously paid order. Implementations may not
   * support partial refunds; the registry caller passes the full order
   * total. The webhook for `charge.refunded` (Stripe) or equivalent flips
   * the local order status; this call just initiates the refund upstream.
   */
  refund(input: { providerRef: string; amountMinor: bigint; currency: string }): Promise<void>;

  /**
   * Verify-on-return fallback. Ask the provider whether the transaction for
   * `reference` (our order id) actually succeeded, so the confirm page can
   * settle an order synchronously when the async webhook is late or missed.
   * Optional: providers that cannot verify synchronously may omit it.
   */
  verifyTransaction?(reference: string): Promise<TransactionStatus>;
}
