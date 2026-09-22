import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { fromSmallestUnit, toSmallestUnit } from '../money';
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentProvider,
  RefundResult,
  TransactionStatus,
  WebhookOutcome,
} from './types';

@Injectable()
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe' as const;
  readonly supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NGN', 'ZAR'] as const;

  private readonly logger = new Logger(StripeProvider.name);
  private readonly client: Stripe | null;
  private readonly webhookSecret: string | null;

  constructor(cfg: ConfigService) {
    const secret = cfg.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = cfg.get<string>('STRIPE_WEBHOOK_SECRET') ?? null;
    // Pin to the API version this SDK was built against (stripe@15 ->
    // '2024-04-10'). The version is sent to Stripe as the `Stripe-Version`
    // header, and Stripe rejects every request with "Invalid Stripe API
    // version" when given a version it does not recognise, so this pin MUST
    // move in lockstep with the `stripe` package. Only set STRIPE_API_VERSION
    // when bumping the SDK to a release that supports the newer version.
    const apiVersion =
      (cfg.get<string>('STRIPE_API_VERSION') ?? '2024-04-10') as Stripe.LatestApiVersion;
    this.client = secret ? new Stripe(secret, { apiVersion }) : null;
    if (!this.client) {
      this.logger.warn('STRIPE_SECRET_KEY is not set; Stripe provider is disabled');
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
    if (!this.client) throw new Error('Stripe provider is not configured');

    const session = await this.client.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: input.customerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: toSmallestUnit(input.amountMinor, input.currency),
            product_data: { name: input.description },
          },
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // We only persist `orderId` here; the webhook handler reads it back
      // from `event.data.object.metadata.orderId`.
      metadata: { orderId: input.orderId },
      payment_intent_data: {
        metadata: { orderId: input.orderId },
      },
    });

    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    return { sessionId: session.id, url: session.url };
  }

  async parseAndVerifyWebhook(
    rawBody: Buffer,
    signatureHeader: string,
  ): Promise<WebhookOutcome> {
    if (!this.client) throw new Error('Stripe provider is not configured');
    if (!this.webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set; cannot verify webhook');
    }

    let event: Stripe.Event;
    try {
      event = this.client.webhooks.constructEvent(rawBody, signatureHeader, this.webhookSecret);
    } catch (err) {
      this.logger.warn({ err }, 'Stripe webhook signature verification failed');
      throw new UnauthorizedException('Invalid Stripe signature');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (!orderId) return { type: 'ignored', reason: 'No orderId in metadata' };
        // Card-only checkout settles synchronously, so payment_status is 'paid'
        // on completion. If delayed payment methods are ever enabled, this event
        // can fire while still unpaid; only treat a paid session as paid. The
        // async_payment_succeeded case below then settles delayed methods.
        if (session.payment_status !== 'paid') {
          return {
            type: 'ignored',
            reason: `Session completed but not paid (payment_status=${session.payment_status})`,
          };
        }
        const captured = capturedFromSession(session);
        if (!captured) {
          return { type: 'ignored', reason: 'Session has no amount_total/currency to verify' };
        }
        return {
          type: 'paid',
          orderId,
          providerEventId: event.id,
          paidAt: new Date((event.created ?? Date.now() / 1000) * 1000),
          ...captured,
        };
      }
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (!orderId) return { type: 'ignored', reason: 'No orderId in metadata' };
        const captured = capturedFromSession(session);
        if (!captured) {
          return { type: 'ignored', reason: 'Session has no amount_total/currency to verify' };
        }
        return {
          type: 'paid',
          orderId,
          providerEventId: event.id,
          paidAt: new Date((event.created ?? Date.now() / 1000) * 1000),
          ...captured,
        };
      }
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (!orderId) return { type: 'ignored', reason: 'No orderId in metadata' };
        return {
          type: 'failed',
          orderId,
          providerEventId: event.id,
          reason: event.type,
        };
      }
      case 'charge.refunded':
      case 'charge.refund.updated': {
        const charge = event.data.object as Stripe.Charge;
        let orderId: string | undefined =
          (charge.metadata?.orderId as string | undefined) ??
          (typeof charge.payment_intent === 'string'
            ? undefined
            : (charge.payment_intent?.metadata as { orderId?: string } | undefined)?.orderId);
        // In a webhook payload `charge.payment_intent` is a bare id string, and
        // a Charge does NOT inherit its PaymentIntent's metadata, so our
        // orderId (set on the PI at checkout via payment_intent_data.metadata)
        // is absent from the event. Retrieve the PI to resolve it; without this
        // step a refund can never settle locally and the order is stranded as
        // `paid` forever even with the webhook correctly configured.
        if (!orderId && typeof charge.payment_intent === 'string') {
          try {
            const pi = await this.client.paymentIntents.retrieve(charge.payment_intent);
            orderId = (pi.metadata as { orderId?: string } | undefined)?.orderId;
          } catch (err) {
            this.logger.warn({ err }, 'Stripe refund webhook: failed to retrieve PI for orderId');
          }
        }
        if (!orderId) return { type: 'ignored', reason: 'No orderId on refund' };
        return { type: 'refunded', orderId, providerEventId: event.id };
      }
      default:
        return { type: 'ignored', reason: `Unhandled event type: ${event.type}` };
    }
  }

  /**
   * Verify-on-return: the order's providerRef is the Checkout Session id.
   * Retrieve it and treat `payment_status === 'paid'` as settled.
   */
  async verifyTransaction(input: {
    orderId: string;
    providerRef: string | null;
  }): Promise<TransactionStatus> {
    if (!this.client) throw new Error('Stripe provider is not configured');
    if (!input.providerRef) return { status: 'pending' };
    try {
      const session = await this.client.checkout.sessions.retrieve(input.providerRef);
      if (session.payment_status === 'paid') {
        const captured = capturedFromSession(session);
        if (!captured) {
          // Paid but unverifiable amount. Stay pending rather than settle
          // blind; reconciliation retries and the mismatch stays visible.
          this.logger.warn(
            { providerRef: input.providerRef },
            'Stripe session paid but has no amount_total/currency; not settling',
          );
          return { status: 'pending' };
        }
        return {
          status: 'success',
          paidAt: new Date(),
          providerRef: input.providerRef,
          ...captured,
        };
      }
      if (session.status === 'expired') return { status: 'failed' };
      return { status: 'pending' };
    } catch (err) {
      this.logger.warn({ err }, 'Stripe verify failed');
      return { status: 'pending' };
    }
  }

  async refund(input: {
    providerRef: string;
    amountMinor: bigint;
    currency: string;
  }): Promise<RefundResult> {
    if (!this.client) throw new Error('Stripe provider is not configured');
    // `providerRef` is the Checkout Session id we stored on the order. To
    // refund we need the Payment Intent it expanded into.
    const session = await this.client.checkout.sessions.retrieve(input.providerRef);
    const paymentIntent =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!paymentIntent) {
      throw new Error('Cannot refund: no payment_intent on the session');
    }
    const refund = await this.client.refunds.create({
      payment_intent: paymentIntent,
      amount: toSmallestUnit(input.amountMinor, input.currency),
      // We do not pass `currency` because Stripe derives it from the
      // payment intent. Passing a different currency here causes a 400.
    });
    return { status: mapRefundStatus(refund.status) };
  }

  /**
   * Refund reconciliation: resolve the session's PaymentIntent and inspect its
   * charge. A fully-refunded charge (`refunded` flag, or amount_refunded >=
   * amount) means the refund settled upstream even if the webhook and the
   * synchronous result were both missed. Returns `pending` on any lookup error
   * so the sweep simply retries next tick rather than wrongly flipping state.
   */
  async verifyRefund(input: { providerRef: string }): Promise<RefundResult> {
    if (!this.client) throw new Error('Stripe provider is not configured');
    try {
      const session = await this.client.checkout.sessions.retrieve(input.providerRef);
      const piId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;
      if (!piId) return { status: 'pending' };
      const pi = await this.client.paymentIntents.retrieve(piId, { expand: ['latest_charge'] });
      const charge = typeof pi.latest_charge === 'string' ? null : pi.latest_charge;
      if (charge && (charge.refunded || charge.amount_refunded >= charge.amount)) {
        return { status: 'succeeded' };
      }
      return { status: 'pending' };
    } catch (err) {
      this.logger.warn({ err }, 'Stripe verifyRefund failed');
      return { status: 'pending' };
    }
  }
}

/**
 * Map a Stripe refund's `status` to our canonical refund outcome. Card refunds
 * usually return `succeeded` synchronously; bank-backed methods can sit in
 * `pending` for days; `failed`/`canceled` mean the money did not move.
 * https://stripe.com/docs/api/refunds/object#refund_object-status
 */
function mapRefundStatus(status: Stripe.Refund['status']): RefundResult['status'] {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'failed':
    case 'canceled':
      return 'failed';
    // 'pending' | 'requires_action' | null
    default:
      return 'pending';
  }
}

/**
 * Pull the captured amount off a Checkout Session in Orkora's canonical minor
 * unit. Returns null when Stripe did not report both fields, which the callers
 * treat as "cannot verify" and therefore as "do not settle".
 */
function capturedFromSession(
  session: Stripe.Checkout.Session,
): { amountMinor: bigint; currency: string } | null {
  if (session.amount_total == null || !session.currency) return null;
  const currency = session.currency.toUpperCase();
  return { amountMinor: fromSmallestUnit(session.amount_total, currency), currency };
}
