import type { ConfigService } from '@nestjs/config';

/**
 * Locks the two Stripe refund-path fixes:
 *   1. refund() surfaces the synchronous settlement status so the service can
 *      flip the order to `refunded` without waiting for the webhook.
 *   2. the charge.refunded webhook resolves our orderId from the PaymentIntent
 *      (a Charge does NOT carry the PI's metadata, and `charge.payment_intent`
 *      is a bare id string in webhook payloads), so a refund actually settles
 *      locally instead of being ignored.
 * plus verifyRefund() used by the reconciliation sweep.
 */

const mockClient = {
  checkout: { sessions: { retrieve: jest.fn() } },
  paymentIntents: { retrieve: jest.fn() },
  refunds: { create: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
};

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockClient),
}));

// Imported after jest.mock so the constructor is the mocked one.
import { StripeProvider } from './stripe.provider';

function makeProvider(): StripeProvider {
  const cfg = {
    get: jest.fn((key: string) => {
      if (key === 'STRIPE_SECRET_KEY') return 'sk_test_stripe';
      if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_test';
      return undefined; // STRIPE_API_VERSION -> falls back to the pinned default
    }),
  } as unknown as ConfigService;
  return new StripeProvider(cfg);
}

beforeEach(() => {
  mockClient.checkout.sessions.retrieve.mockReset();
  mockClient.paymentIntents.retrieve.mockReset();
  mockClient.refunds.create.mockReset();
  mockClient.webhooks.constructEvent.mockReset();
});

describe('StripeProvider.refund', () => {
  it('refunds the session PaymentIntent and maps a succeeded refund', async () => {
    mockClient.checkout.sessions.retrieve.mockResolvedValue({ payment_intent: 'pi_1' });
    mockClient.refunds.create.mockResolvedValue({ status: 'succeeded' });

    const out = await makeProvider().refund({
      providerRef: 'cs_1',
      amountMinor: 2000n,
      currency: 'USD',
    });

    expect(out).toEqual({ status: 'succeeded' });
    expect(mockClient.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_1', amount: 2000 }),
    );
  });

  it('maps a still-processing refund to pending', async () => {
    mockClient.checkout.sessions.retrieve.mockResolvedValue({ payment_intent: 'pi_1' });
    mockClient.refunds.create.mockResolvedValue({ status: 'pending' });
    const out = await makeProvider().refund({
      providerRef: 'cs_1',
      amountMinor: 2000n,
      currency: 'USD',
    });
    expect(out).toEqual({ status: 'pending' });
  });

  it('maps a canceled refund to failed', async () => {
    mockClient.checkout.sessions.retrieve.mockResolvedValue({ payment_intent: 'pi_1' });
    mockClient.refunds.create.mockResolvedValue({ status: 'canceled' });
    const out = await makeProvider().refund({
      providerRef: 'cs_1',
      amountMinor: 2000n,
      currency: 'USD',
    });
    expect(out).toEqual({ status: 'failed' });
  });
});

describe('StripeProvider.parseAndVerifyWebhook (charge.refunded)', () => {
  it('resolves orderId from the PaymentIntent when the charge lacks it', async () => {
    mockClient.webhooks.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'charge.refunded',
      data: { object: { metadata: {}, payment_intent: 'pi_1' } },
    });
    mockClient.paymentIntents.retrieve.mockResolvedValue({ metadata: { orderId: 'order-xyz' } });

    const out = await makeProvider().parseAndVerifyWebhook(
      Buffer.from('{}'),
      't=1,v1=sig',
    );

    expect(mockClient.paymentIntents.retrieve).toHaveBeenCalledWith('pi_1');
    expect(out).toEqual({ type: 'refunded', orderId: 'order-xyz', providerEventId: 'evt_1' });
  });

  it('ignores the refund only when the PI also has no orderId', async () => {
    mockClient.webhooks.constructEvent.mockReturnValue({
      id: 'evt_2',
      type: 'charge.refunded',
      data: { object: { metadata: {}, payment_intent: 'pi_2' } },
    });
    mockClient.paymentIntents.retrieve.mockResolvedValue({ metadata: {} });

    const out = await makeProvider().parseAndVerifyWebhook(Buffer.from('{}'), 'sig');
    expect(out).toEqual({ type: 'ignored', reason: 'No orderId on refund' });
  });
});

describe('StripeProvider.verifyRefund', () => {
  it('reports succeeded when the charge is fully refunded', async () => {
    mockClient.checkout.sessions.retrieve.mockResolvedValue({ payment_intent: 'pi_1' });
    mockClient.paymentIntents.retrieve.mockResolvedValue({
      latest_charge: { refunded: true, amount_refunded: 2000, amount: 2000 },
    });
    expect(await makeProvider().verifyRefund({ providerRef: 'cs_1' })).toEqual({
      status: 'succeeded',
    });
  });

  it('reports pending when the charge is not refunded yet', async () => {
    mockClient.checkout.sessions.retrieve.mockResolvedValue({ payment_intent: 'pi_1' });
    mockClient.paymentIntents.retrieve.mockResolvedValue({
      latest_charge: { refunded: false, amount_refunded: 0, amount: 2000 },
    });
    expect(await makeProvider().verifyRefund({ providerRef: 'cs_1' })).toEqual({
      status: 'pending',
    });
  });

  it('reports pending (never throws) on a lookup error', async () => {
    mockClient.checkout.sessions.retrieve.mockRejectedValue(new Error('network'));
    expect(await makeProvider().verifyRefund({ providerRef: 'cs_1' })).toEqual({
      status: 'pending',
    });
  });
});
