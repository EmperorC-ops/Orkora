import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentProvider,
  WebhookOutcome,
} from './types';

/**
 * Flutterwave provider.
 *
 * Initialise: POST https://api.flutterwave.com/v3/payments
 *   Headers: Authorization: Bearer <secret_key>
 *   Body:    { tx_ref, amount, currency, redirect_url, customer, meta }
 *   Returns: { status: 'success', data: { link } }
 *
 * Webhook signature: Flutterwave does NOT HMAC the body; instead the merchant
 * configures a static `secret_hash` in the dashboard, and Flutterwave echoes
 * it back in the `verif-hash` header on every event. We compare in
 * constant time.
 *
 * https://developer.flutterwave.com/docs/standard
 * https://developer.flutterwave.com/docs/integration-guides/webhooks
 */
@Injectable()
export class FlutterwaveProvider implements PaymentProvider {
  readonly name = 'flutterwave' as const;
  readonly supportedCurrencies = ['NGN', 'USD', 'GHS', 'KES', 'ZAR', 'XAF', 'XOF'] as const;

  private readonly logger = new Logger(FlutterwaveProvider.name);
  private readonly secretKey: string | null;
  private readonly secretHash: string | null;

  constructor(cfg: ConfigService) {
    this.secretKey = cfg.get<string>('FLUTTERWAVE_SECRET_KEY') ?? null;
    this.secretHash = cfg.get<string>('FLUTTERWAVE_WEBHOOK_SECRET') ?? null;
    if (!this.secretKey) {
      this.logger.warn('FLUTTERWAVE_SECRET_KEY is not set; Flutterwave provider is disabled');
    }
  }

  get enabled(): boolean {
    return this.secretKey !== null;
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
    if (!this.secretKey) throw new Error('Flutterwave provider is not configured');

    // Flutterwave amount is in major units (e.g. NGN naira), not kobo.
    const major = Number(input.amountMinor) / 100;

    const res = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: input.orderId,
        amount: major,
        currency: input.currency.toUpperCase(),
        redirect_url: input.successUrl,
        customer: { email: input.customerEmail },
        meta: { orderId: input.orderId, description: input.description },
        customizations: { title: 'Orkora', description: input.description },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Flutterwave init failed (${res.status}): ${text}`);
    }
    const body = (await res.json()) as {
      status: string;
      message: string;
      data?: { link: string };
    };
    if (body.status !== 'success' || !body.data?.link) {
      throw new Error(`Flutterwave init declined: ${body.message}`);
    }
    // tx_ref doubles as our session id, since Flutterwave does not return a
    // separate id at init time.
    return { sessionId: input.orderId, url: body.data.link };
  }

  async parseAndVerifyWebhook(
    rawBody: Buffer,
    signatureHeader: string,
  ): Promise<WebhookOutcome> {
    if (!this.secretHash) {
      throw new Error('FLUTTERWAVE_WEBHOOK_SECRET is not set; cannot verify webhook');
    }
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(this.secretHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('Flutterwave webhook hash mismatch');
      throw new UnauthorizedException('Invalid Flutterwave signature');
    }

    let event: {
      event?: string;
      'event.type'?: string;
      data: {
        id?: number | string;
        tx_ref?: string;
        status?: string;
        meta?: { orderId?: string };
      };
    };
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid Flutterwave payload');
    }

    const orderId = event.data.meta?.orderId ?? event.data.tx_ref;
    const providerEventId = String(event.data.id ?? event.data.tx_ref ?? Date.now());
    const status = event.data.status ?? '';
    const eventName = event.event ?? event['event.type'] ?? 'unknown';

    if (eventName === 'charge.completed' || eventName.includes('Transaction')) {
      if (!orderId) return { type: 'ignored', reason: 'No orderId on charge.completed' };
      if (status === 'successful') {
        return { type: 'paid', orderId, providerEventId, paidAt: new Date() };
      }
      if (status === 'failed' || status === 'cancelled') {
        return { type: 'failed', orderId, providerEventId, reason: status };
      }
      return { type: 'ignored', reason: `Unhandled status: ${status}` };
    }
    if (eventName === 'refund.processed') {
      if (!orderId) return { type: 'ignored', reason: 'No orderId on refund' };
      return { type: 'refunded', orderId, providerEventId };
    }
    return { type: 'ignored', reason: `Unhandled Flutterwave event: ${eventName}` };
  }

  async refund(input: {
    providerRef: string;
    amountMinor: bigint;
    currency: string;
  }): Promise<void> {
    if (!this.secretKey) throw new Error('Flutterwave provider is not configured');
    // Flutterwave refund endpoint takes the transaction id (not tx_ref).
    // Our `providerRef` is tx_ref (= orderId), so we must look up the
    // transaction first.
    const lookup = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(input.providerRef)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );
    if (!lookup.ok) {
      throw new Error(`Flutterwave verify failed: ${lookup.status}`);
    }
    const verifyBody = (await lookup.json()) as { data?: { id?: number } };
    const txId = verifyBody.data?.id;
    if (!txId) throw new Error('Flutterwave: no transaction id for ref');

    const refund = await fetch(
      `https://api.flutterwave.com/v3/transactions/${txId}/refund`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: Number(input.amountMinor) / 100 }),
      },
    );
    if (!refund.ok) {
      const text = await refund.text().catch(() => '');
      throw new Error(`Flutterwave refund failed (${refund.status}): ${text}`);
    }
  }
}
