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

/**
 * Outcome of a refund, used both for the synchronous result of `refund()` and
 * for the `verifyRefund()` reconciliation lookup:
 *   - `succeeded`: the refund is settled upstream (the local order can flip to
 *     `refunded` immediately, no webhook required).
 *   - `pending`: the refund was accepted but is still processing (e.g. a bank
 *     refund that takes days); settle later via webhook or reconciliation.
 *   - `failed`: the refund was rejected or cancelled upstream; leave the order
 *     `paid` and surface the failure.
 */
export interface RefundResult {
  status: 'succeeded' | 'pending' | 'failed';
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
   * total. Returns the refund's settlement state so the service can flip the
   * order to `refunded` synchronously when the provider settles immediately
   * (most card refunds), rather than depending solely on the async
   * `charge.refunded` (Stripe) / `refund.processed` (Paystack/Flutterwave)
   * webhook. A `pending` result is settled later by webhook or by
   * `verifyRefund` reconciliation.
   */
  refund(input: {
    providerRef: string;
    amountMinor: bigint;
    currency: string;
  }): Promise<RefundResult>;

  /**
   * Verify-on-return fallback. Ask the provider whether the transaction for
   * `reference` (our order id) actually succeeded, so the confirm page can
   * settle an order synchronously when the async webhook is late or missed.
   * Optional: providers that cannot verify synchronously may omit it.
   */
  verifyTransaction?(input: {
    orderId: string;
    providerRef: string | null;
  }): Promise<TransactionStatus>;

  /**
   * Refund-reconciliation lookup. Ask the provider whether the refund for a
   * given order (identified by its `providerRef`) has settled, so a refund
   * whose webhook AND synchronous result were both missed/pending is still
   * confirmed by the reconciliation sweep. Mirrors `verifyTransaction` for the
   * payment side. Optional: providers that cannot verify a refund synchronously
   * may omit it.
   */
  verifyRefund?(input: { providerRef: string }): Promise<RefundResult>;
}
