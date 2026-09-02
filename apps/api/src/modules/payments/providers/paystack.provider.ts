import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { fromSmallestUnit, toSmallestUnit } from '../money';
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentProvider,
  RefundResult,
  TransactionStatus,
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
        amount: toSmallestUnit(input.amountMinor, input.currency),
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
        // Captured amount in the smallest currency unit, plus the currency it
        // was actually charged in. Both are compared against the order at
        // settlement, so a charge for the wrong amount or in a swapped
        // currency never issues a ticket.
        amount?: number;
        currency?: string;
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
        if (event.data.amount == null || !event.data.currency) {
          return { type: 'ignored', reason: 'charge.success has no amount/currency to verify' };
        }
        const currency = event.data.currency.toUpperCase();
        return {
          type: 'paid',
          orderId,
          providerEventId,
          paidAt: event.data.paid_at ? new Date(event.data.paid_at) : new Date(),
          amountMinor: fromSmallestUnit(event.data.amount, currency),
          currency,
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

  /**
   * Synchronously verify a transaction via Paystack's verify endpoint. Our
   * order id is used as the transaction `reference`. Used by the confirm page
   * to settle an order when the webhook is late or never arrives.
   * https://paystack.com/docs/api/transaction/#verify
   */
  async verifyTransaction(input: {
    orderId: string;
    providerRef: string | null;
  }): Promise<TransactionStatus> {
    if (!this.secretKey) throw new Error('Paystack provider is not configured');
    // Paystack's transaction reference is our order id (set at init time).
    const reference = input.orderId;
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );
    if (!res.ok) {
      // 404 = reference not found yet (user may not have paid). Treat as
      // pending so the caller keeps polling rather than failing a live order.
      this.logger.warn(`Paystack verify failed (${res.status}) for ${reference}`);
      return { status: 'pending' };
    }
    const body = (await res.json()) as {
      status: boolean;
      data?: {
        status?: string;
        paid_at?: string;
        id?: number | string;
        amount?: number;
        currency?: string;
      };
    };
    const data = body.data;
    if (!body.status || !data?.status) return { status: 'pending' };
    if (data.status === 'success') {
      if (data.amount == null || !data.currency) {
        // Successful but unverifiable amount. Stay pending rather than settle
        // blind; the reconciliation sweep retries.
        this.logger.warn(
          `Paystack verify for ${reference} returned success without amount/currency; not settling`,
        );
        return { status: 'pending' };
      }
      const currency = data.currency.toUpperCase();
      return {
        status: 'success',
        paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
        providerRef: String(data.id ?? reference),
        amountMinor: fromSmallestUnit(data.amount, currency),
        currency,
      };
    }
    if (['failed', 'abandoned', 'reversed'].includes(data.status)) {
      return { status: 'failed' };
    }
    // 'ongoing' / 'pending' / 'processing' / queued: not settled yet.
    return { status: 'pending' };
  }

  async refund(input: {
    providerRef: string;
    amountMinor: bigint;
    currency: string;
  }): Promise<RefundResult> {
    if (!this.secretKey) throw new Error('Paystack provider is not configured');
    const res = await fetch('https://api.paystack.co/refund', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: input.providerRef,
        amount: toSmallestUnit(input.amountMinor, input.currency),
        currency: input.currency.toUpperCase(),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Paystack refund failed (${res.status}): ${text}`);
    }
    const body = (await res.json().catch(() => ({}))) as {
      data?: { status?: string };
    };
    return { status: mapPaystackRefundStatus(body.data?.status) };
  }

  /**
   * Refund reconciliation: list refunds Paystack holds for this transaction
   * (our providerRef is the transaction reference) and report the strongest
   * outcome. `processed` means the money moved; if the only refunds are
   * `failed`, surface that; anything still in flight is `pending`. Returns
   * `pending` on any lookup error so the sweep retries.
   * https://paystack.com/docs/api/refund/#list
   */
  async verifyRefund(input: { providerRef: string }): Promise<RefundResult> {
    if (!this.secretKey) throw new Error('Paystack provider is not configured');
    try {
      const res = await fetch(
        `https://api.paystack.co/refund?transaction=${encodeURIComponent(input.providerRef)}`,
        { headers: { Authorization: `Bearer ${this.secretKey}` } },
      );
      if (!res.ok) return { status: 'pending' };
      const body = (await res.json()) as {
        status: boolean;
        data?: Array<{ status?: string }>;
      };
      const refunds = body.data ?? [];
      if (refunds.length === 0) return { status: 'pending' };
      const statuses = refunds.map((r) => mapPaystackRefundStatus(r.status));
      if (statuses.includes('succeeded')) return { status: 'succeeded' };
      if (statuses.every((s) => s === 'failed')) return { status: 'failed' };
      return { status: 'pending' };
    } catch (err) {
      this.logger.warn({ err }, 'Paystack verifyRefund failed');
      return { status: 'pending' };
    }
  }
}

/**
 * Map a Paystack refund `status` to our canonical outcome. Paystack reports
 * `pending` -> `processing` -> `processed`, or `failed`.
 * https://paystack.com/docs/payments/refunds/
 */
function mapPaystackRefundStatus(status: string | undefined): RefundResult['status'] {
  switch (status) {
    case 'processed':
      return 'succeeded';
    case 'failed':
      return 'failed';
    // 'pending' | 'processing' | undefined
    default:
      return 'pending';
  }
}
