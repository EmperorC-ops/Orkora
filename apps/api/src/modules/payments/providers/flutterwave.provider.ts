import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { fromMajorUnit, toMajorUnit } from '../money';
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentProvider,
  RefundResult,
  TransactionStatus,
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
    const major = toMajorUnit(input.amountMinor);

    // Split settlement. When the caller supplies the organizer's connected
    // subaccount, route the payment to it and keep the platform fee as a flat
    // commission. `transaction_charge_type: 'flat'` means WE receive exactly
    // `transaction_charge` and the subaccount gets the remainder (Flutterwave's
    // own processing fee comes out of the subaccount's share). The commission is
    // in MAJOR units like every other Flutterwave amount, which is the one way
    // this differs from Paystack and must not be confused with kobo.
    // https://developer.flutterwave.com/docs/split-payments (Overriding the Default)
    const subaccounts =
      input.subaccountCode && input.platformFeeMinor !== undefined
        ? [
            {
              id: input.subaccountCode,
              transaction_charge_type: 'flat',
              transaction_charge: toMajorUnit(input.platformFeeMinor),
            },
          ]
        : undefined;

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
        ...(subaccounts ? { subaccounts } : {}),
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
        // Flutterwave reports MAJOR units. `amount` is the transaction amount;
        // `charged_amount` is what the customer was actually debited (it can
        // exceed `amount` when the customer absorbs the fee). We settle
        // against `amount`, which is the figure that corresponds to the order
        // total we sent at init.
        amount?: number;
        currency?: string;
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
        // Flutterwave's own guidance: confirm status, amount, currency and
        // tx_ref against your record before giving value. Without both fields
        // we cannot, so we refuse to settle from this event and let the
        // verify-on-return / reconciliation path re-query the API instead.
        if (event.data.amount == null || !event.data.currency) {
          return {
            type: 'ignored',
            reason: 'charge.completed has no amount/currency to verify',
          };
        }
        return {
          type: 'paid',
          orderId,
          providerEventId,
          paidAt: new Date(),
          amountMinor: fromMajorUnit(event.data.amount),
          currency: event.data.currency.toUpperCase(),
        };
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

  /**
   * Verify-on-return: Flutterwave's tx_ref is our order id, so we can verify
   * by reference and treat status 'successful' as settled.
   */
  async verifyTransaction(input: {
    orderId: string;
    providerRef: string | null;
  }): Promise<TransactionStatus> {
    if (!this.secretKey) throw new Error('Flutterwave provider is not configured');
    const res = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(input.orderId)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );
    if (!res.ok) {
      this.logger.warn(`Flutterwave verify failed (${res.status}) for ${input.orderId}`);
      return { status: 'pending' };
    }
    const body = (await res.json()) as {
      status: string;
      data?: { status?: string; id?: number | string; amount?: number; currency?: string };
    };
    const txStatus = body.data?.status;
    if (body.status === 'success' && txStatus === 'successful') {
      if (body.data?.amount == null || !body.data.currency) {
        this.logger.warn(
          `Flutterwave verify for ${input.orderId} returned successful without amount/currency; not settling`,
        );
        return { status: 'pending' };
      }
      return {
        status: 'success',
        paidAt: new Date(),
        providerRef: String(body.data?.id ?? input.orderId),
        amountMinor: fromMajorUnit(body.data.amount),
        currency: body.data.currency.toUpperCase(),
      };
    }
    if (txStatus === 'failed' || txStatus === 'cancelled') {
      return { status: 'failed' };
    }
    return { status: 'pending' };
  }

  /**
   * Refund the buyer. Per Flutterwave's refunds doc, the refund amount is
   * deducted from OUR available balance (the platform wallet). There is no
   * request parameter that reverses a subaccount split, and the doc does not
   * state that an organizer's already-settled share is clawed back. So on a
   * split charge a full refund is funded entirely by Orkora, and recovering the
   * organizer's portion is a ledger matter (netting against their later
   * settlements), not an API call. This is the opposite of Paystack's automatic
   * proportional reversal and must be verified in test mode before the fee
   * goes live on Flutterwave. The buyer still gets the full amount back, which
   * is the PLATFORM_FEE_REFUNDABLE policy; `refundBreakdownMinor` stays correct.
   * https://developer.flutterwave.com/docs/refunds
   */
  async refund(input: {
    providerRef: string;
    amountMinor: bigint;
    currency: string;
  }): Promise<RefundResult> {
    if (!this.secretKey) throw new Error('Flutterwave provider is not configured');
    // Flutterwave refund endpoint takes the transaction id (not tx_ref).
    // Our `providerRef` is tx_ref (= orderId), so we must look up the
    // transaction first.
    const txId = await this.resolveTxId(input.providerRef);
    if (!txId) throw new Error('Flutterwave: no transaction id for ref');

    const refund = await fetch(
      `https://api.flutterwave.com/v3/transactions/${txId}/refund`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: toMajorUnit(input.amountMinor) }),
      },
    );
    if (!refund.ok) {
      const text = await refund.text().catch(() => '');
      throw new Error(`Flutterwave refund failed (${refund.status}): ${text}`);
    }
    const body = (await refund.json().catch(() => ({}))) as {
      data?: { status?: string };
    };
    return { status: mapFlutterwaveRefundStatus(body.data?.status) };
  }

  /**
   * Refund reconciliation: list the refunds Flutterwave holds for the
   * transaction behind our providerRef (tx_ref) and report the strongest
   * outcome. A `completed` refund means the money moved. Returns `pending` on
   * any lookup error so the sweep retries.
   * https://developer.flutterwave.com/reference/list-all-refunds
   */
  async verifyRefund(input: { providerRef: string }): Promise<RefundResult> {
    if (!this.secretKey) throw new Error('Flutterwave provider is not configured');
    try {
      const txId = await this.resolveTxId(input.providerRef);
      if (!txId) return { status: 'pending' };
      const res = await fetch(
        `https://api.flutterwave.com/v3/transactions/${txId}/refunds`,
        { headers: { Authorization: `Bearer ${this.secretKey}` } },
      );
      if (!res.ok) return { status: 'pending' };
      const body = (await res.json()) as { status: string; data?: Array<{ status?: string }> };
      const refunds = body.data ?? [];
      if (refunds.length === 0) return { status: 'pending' };
      const statuses = refunds.map((r) => mapFlutterwaveRefundStatus(r.status));
      if (statuses.includes('succeeded')) return { status: 'succeeded' };
      if (statuses.every((s) => s === 'failed')) return { status: 'failed' };
      return { status: 'pending' };
    } catch (err) {
      this.logger.warn({ err }, 'Flutterwave verifyRefund failed');
      return { status: 'pending' };
    }
  }

  // ---------- Connected accounts (collection subaccounts) ----------
  //
  // Flutterwave settles split payments to a "collection subaccount" that stands
  // in for the organizer's bank account. Onboarding is a direct API flow like
  // Paystack (no redirect): list banks for the country, resolve the account
  // number to confirm the holder, then create the subaccount and keep its
  // `RS_...` id. Note these are COLLECTION subaccounts (/v3/subaccounts), not
  // the separate "payout subaccount" wallet product (/v3/payout-subaccounts).
  // https://developer.flutterwave.com/docs/split-payments

  /** Settlement banks for an ISO-2 country, for the bank picker. */
  async listBanks(country: string): Promise<Array<{ name: string; code: string }>> {
    if (!this.secretKey) throw new Error('Flutterwave provider is not configured');
    const res = await fetch(
      `https://api.flutterwave.com/v3/banks/${encodeURIComponent(country.toUpperCase())}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Flutterwave bank list failed (${res.status}): ${text}`);
    }
    const body = (await res.json()) as {
      status: string;
      data?: Array<{ name: string; code: string }>;
    };
    if (body.status !== 'success' || !body.data) return [];
    return body.data.map((b) => ({ name: b.name, code: b.code }));
  }

  /**
   * Resolve a bank account to confirm the holder name before creating a
   * subaccount, so a mistyped number cannot pay the wrong person.
   * https://developer.flutterwave.com/reference/resolve-account-transfer-details
   */
  async resolveAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<{ accountName: string }> {
    if (!this.secretKey) throw new Error('Flutterwave provider is not configured');
    const res = await fetch('https://api.flutterwave.com/v3/accounts/resolve', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account_number: accountNumber, account_bank: bankCode }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Flutterwave account resolve failed (${res.status}): ${text}`);
    }
    const body = (await res.json()) as {
      status: string;
      message: string;
      data?: { account_name?: string };
    };
    if (body.status !== 'success' || !body.data?.account_name) {
      throw new Error(`Could not verify that account: ${body.message}`);
    }
    return { accountName: body.data.account_name };
  }

  /**
   * Create a Flutterwave collection subaccount for an organizer's settlement
   * bank account. The default split is `percentage` at 0, so the subaccount
   * takes nothing by itself; the platform fee is applied per transaction as a
   * flat `transaction_charge` override in createCheckoutSession. Creating a
   * subaccount therefore never moves money or takes a cut on its own.
   * Returns the `RS_...` subaccount id used in the checkout split.
   * https://developer.flutterwave.com/docs/split-payments (Creating Subaccounts)
   */
  async createSubaccount(input: {
    businessName: string;
    businessMobile: string;
    businessEmail?: string;
    bankCode: string;
    accountNumber: string;
    country: string;
  }): Promise<{ subaccountId: string }> {
    if (!this.secretKey) throw new Error('Flutterwave provider is not configured');
    const res = await fetch('https://api.flutterwave.com/v3/subaccounts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account_bank: input.bankCode,
        account_number: input.accountNumber,
        business_name: input.businessName,
        business_mobile: input.businessMobile,
        ...(input.businessEmail ? { business_email: input.businessEmail } : {}),
        country: input.country.toUpperCase(),
        split_type: 'percentage',
        split_value: 0,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Flutterwave subaccount create failed (${res.status}): ${text}`);
    }
    const body = (await res.json()) as {
      status: string;
      message: string;
      data?: { subaccount_id?: string };
    };
    if (body.status !== 'success' || !body.data?.subaccount_id) {
      throw new Error(`Flutterwave subaccount declined: ${body.message}`);
    }
    return { subaccountId: body.data.subaccount_id };
  }

  /** Resolve Flutterwave's numeric transaction id from our tx_ref (= orderId). */
  private async resolveTxId(txRef: string): Promise<number | null> {
    const lookup = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );
    if (!lookup.ok) {
      throw new Error(`Flutterwave verify failed: ${lookup.status}`);
    }
    const verifyBody = (await lookup.json()) as { data?: { id?: number } };
    return verifyBody.data?.id ?? null;
  }
}

/**
 * Map a Flutterwave refund `status` to our canonical outcome. Flutterwave
 * reports `completed` or `pending` (and `failed` when the refund is rejected).
 * https://developer.flutterwave.com/docs/making-payments/refunds
 */
function mapFlutterwaveRefundStatus(status: string | undefined): RefundResult['status'] {
  switch (status) {
    case 'completed':
      return 'succeeded';
    case 'failed':
      return 'failed';
    // 'pending' | undefined
    default:
      return 'pending';
  }
}
