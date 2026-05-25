import type { ConfigService } from '@nestjs/config';
import { PaystackProvider } from './paystack.provider';

/**
 * Locks Paystack's refund settlement signals. The organizer refund flow flips
 * an order to `refunded` synchronously when refund() reports `succeeded`, and
 * the reconciliation sweep finishes a pending refund via verifyRefund(); both
 * depend on the status mapping here being exactly right.
 */

function makeProvider(): PaystackProvider {
  const cfg = { get: jest.fn().mockReturnValue('sk_test_paystack') } as unknown as ConfigService;
  return new PaystackProvider(cfg);
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('PaystackProvider.refund', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps a processed refund to succeeded', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ data: { status: 'processed' } }));
    const out = await makeProvider().refund({
      providerRef: 'txn_1',
      amountMinor: 2000n,
      currency: 'NGN',
    });
    expect(out).toEqual({ status: 'succeeded' });
  });

  it('maps a still-processing refund to pending', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ data: { status: 'pending' } }));
    const out = await makeProvider().refund({
      providerRef: 'txn_1',
      amountMinor: 2000n,
      currency: 'NGN',
    });
    expect(out).toEqual({ status: 'pending' });
  });

  it('maps a declined refund to failed', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ data: { status: 'failed' } }));
    const out = await makeProvider().refund({
      providerRef: 'txn_1',
      amountMinor: 2000n,
      currency: 'NGN',
    });
    expect(out).toEqual({ status: 'failed' });
  });

  it('throws when Paystack rejects the refund request', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ message: 'nope' }, false));
    await expect(
      makeProvider().refund({ providerRef: 'txn_1', amountMinor: 2000n, currency: 'NGN' }),
    ).rejects.toThrow(/Paystack refund failed/);
  });
});

describe('PaystackProvider.verifyRefund', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports succeeded when any listed refund is processed', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ status: true, data: [{ status: 'processed' }] }));
    expect(await makeProvider().verifyRefund({ providerRef: 'txn_1' })).toEqual({
      status: 'succeeded',
    });
  });

  it('reports failed only when every listed refund failed', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ status: true, data: [{ status: 'failed' }] }));
    expect(await makeProvider().verifyRefund({ providerRef: 'txn_1' })).toEqual({
      status: 'failed',
    });
  });

  it('reports pending when no refunds are listed yet', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ status: true, data: [] }));
    expect(await makeProvider().verifyRefund({ providerRef: 'txn_1' })).toEqual({
      status: 'pending',
    });
  });

  it('reports pending (never throws) on a lookup error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network'));
    expect(await makeProvider().verifyRefund({ providerRef: 'txn_1' })).toEqual({
      status: 'pending',
    });
  });
});
