import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentProvider,
  WebhookOutcome,
} from './types';

/**
 * Paystack provider.
 *
 * Initialise: POST https://api.paystack.co/transaction/initialize
 *   Headers: Authorization: Bearer <secret_key>
 *   Body:    { email, amount (minor units), currency, callback_url, metadata }
 *   Returns: { status, data: { authorization_url, access_code, reference } }
 *
 * Webhook signature: HMAC-SHA512 of the raw body using the secret key.
 * Header: `x-paystack-signature`.
 *
 * https://paystack.com/docs/api/transaction
 * https://paystack.com/docs/payments/webhooks
 */
@Injectable()
export class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack' as const;
  readonly supportedCurrencies = ['NGN', 'GHS', 'ZAR', 'KES', 'USD'] as const;

  private readonly logger = new Logger(PaystackProvider.name);
  private readonly secretKey: string | null;

  constructor(cfg: ConfigService) {
    this.secretKey = cfg.get<string>('PAYSTACK_SECRET_KEY') ?? null;
    if (!this.secretKey) {
      this.logger.warn('PAYSTACK_SECRET_KEY is not set; Paystack provider is disabled');
    }
  }

  get enabled(): boolean {
    return this.secretKey !== null;
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
    if (!this.secretKey) throw new Error('Paystack provider is not configured');

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: input.customerEmail,
        amount: Number(input.amountMinor),
        currency: input.currency.toUpperCase(),
        callback_url: input.successUrl,
        // Paystack passes `metadata` straight through to the webhook payload.
        metadata: { orderId: input.orderId, description: input.description },
        // The reference is what Paystack uses to identify the transaction. We
        // mirror our orderId for easy correlation.
        reference: input.orderId,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Paystack init failed (${res.status}): ${text}`);
    }
    const body = (await res.json()) as {
      status: boolean;
      message: string;
      data?: { authorization_url: string; access_code: string; reference: string };
    };
    if (!body.status || !body.data) {
      throw new Error(`Paystack init declined: ${body.message}`);
    }
    return { sessionId: body.data.reference, url: body.data.authorization_url };
  }

  async parseAndVerifyWebhook(
    rawBody: Buffer,
    signatureHeader: string,
  ): Promise<WebhookOutcome> {
    if (!this.secretKey) throw new Error('Paystack provider is not configured');

    const expected = createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('Paystack webhook signature mismatch');
      throw new UnauthorizedException('Invalid Paystack signature');
    }

    let event: {
      event: string;
      data: {
        reference?: string;
        status?: string;
        paid_at?: string;
        metadata?: { orderId?: string };
      };
      id?: string | number;
    };
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid Paystack payload');
    }

    const orderId = event.data.metadata?.orderId ?? event.data.reference;
    const providerEventId = String(event.id ?? `${event.event}:${event.data.reference ?? ''}`);

    switch (event.event) {
      case 'charge.success': {
        if (!orderId) return { type: 'ignored', reason: 'No orderId in charge.success' };
        return {
          type: 'paid',
          orderId,
          providerEventId,
          paidAt: event.data.paid_at ? new Date(event.data.paid_at) : new Date(),
        };
      }
      case 'charge.failed': {
        if (!orderId) return { type: 'ignored', reason: 'No orderId in charge.failed' };
        return {
          type: 'failed',
          orderId,
          providerEventId,
          reason: event.data.status ?? 'failed',
        };
      }
      case 'refund.processed':
      case 'refund.pending': {
        if (!orderId) return { type: 'ignored', reason: 'No orderId in refund' };
        return { type: 'refunded', orderId, providerEventId };
      }
      default:
        return { type: 'ignored', reason: `Unhandled Paystack event: ${event.event}` };
    }
  }

  async refund(input: {
    providerRef: string;
    amountMinor: bigint;
    currency: string;
  }): Promise<void> {
    if (!this.secretKey) throw new Error('Paystack provider is not configured');
    const res = await fetch('https://api.paystack.co/refund', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: input.providerRef,
        amount: Number(input.amountMinor),
        currency: input.currency.toUpperCase(),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Paystack refund failed (${res.status}): ${text}`);
    }
  }
}
