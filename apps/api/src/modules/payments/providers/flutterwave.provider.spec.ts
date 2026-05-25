import type { ConfigService } from '@nestjs/config';
import { FlutterwaveProvider } from './flutterwave.provider';

/**
 * Locks Flutterwave's refund settlement signals. refund() must first resolve
 * the numeric transaction id from our tx_ref, then POST the refund and map the
 * result; verifyRefund() lists refunds for reconciliation. Both feed the
 * order's synchronous/eventual flip to `refunded`.
 */

function makeProvider(): FlutterwaveProvider {
  const cfg = {
    get: jest.fn((key: string) =>
      key === 'FLUTTERWAVE_SECRET_KEY' ? 'sk_test_flw' : 'hash_secret',
    ),
  } as unknown as ConfigService;
  return new FlutterwaveProvider(cfg);
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('FlutterwaveProvider.refund', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves the tx id, then maps a completed refund to succeeded', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ data: { id: 777 } })) // verify_by_reference
      .mockResolvedValueOnce(jsonResponse({ data: { status: 'completed' } })); // refund
    const out = await makeProvider().refund({
      providerRef: 'order-ref',
      amountMinor: 5000n,
      currency: 'GHS',
    });
    expect(out).toEqual({ status: 'succeeded' });
    // The refund POST targets the resolved numeric id, not the tx_ref.
    expect(fetchSpy.mock.calls[1]?.[0]).toContain('/transactions/777/refund');
  });

  it('maps a still-processing refund to pending', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ data: { id: 777 } }))
      .mockResolvedValueOnce(jsonResponse({ data: { status: 'pending' } }));
    const out = await makeProvider().refund({
      providerRef: 'order-ref',
      amountMinor: 5000n,
      currency: 'GHS',
    });
    expect(out).toEqual({ status: 'pending' });
  });

  it('throws when the transaction cannot be resolved', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ data: {} }));
    await expect(
      makeProvider().refund({ providerRef: 'order-ref', amountMinor: 5000n, currency: 'GHS' }),
    ).rejects.toThrow(/no transaction id/);
  });
});

describe('FlutterwaveProvider.verifyRefund', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports succeeded when any listed refund is completed', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ data: { id: 777 } }))
      .mockResolvedValueOnce(jsonResponse({ status: 'success', data: [{ status: 'completed' }] }));
    expect(await makeProvider().verifyRefund({ providerRef: 'order-ref' })).toEqual({
      status: 'succeeded',
    });
  });

  it('reports pending when no refunds are listed yet', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ data: { id: 777 } }))
      .mockResolvedValueOnce(jsonResponse({ status: 'success', data: [] }));
    expect(await makeProvider().verifyRefund({ providerRef: 'order-ref' })).toEqual({
      status: 'pending',
    });
  });

  it('reports pending (never throws) when the tx lookup fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network'));
    expect(await makeProvider().verifyRefund({ providerRef: 'order-ref' })).toEqual({
      status: 'pending',
    });
  });
});
