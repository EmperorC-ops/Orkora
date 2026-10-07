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

/**
 * Checkout split. When the caller supplies the organizer's subaccount and the
 * platform fee, the /v3/payments body must carry a `subaccounts` entry keyed by
 * the RS_ id with a flat `transaction_charge` in MAJOR units (the Flutterwave
 * pitfall: not kobo). Without a subaccount the body must not mention splits at
 * all, so today's central settlement is byte-for-byte unchanged.
 */
describe('FlutterwaveProvider.createCheckoutSession split', () => {
  afterEach(() => jest.restoreAllMocks());

  const base = {
    orderId: 'order-1',
    amountMinor: 1_500_000n, // NGN 15,000.00
    currency: 'NGN',
    customerEmail: 'a@x.test',
    successUrl: 'https://app/confirm',
    cancelUrl: 'https://app/cancel',
    description: 'Ticket',
  };

  function sentBody(fetchSpy: jest.SpyInstance): Record<string, unknown> {
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  }

  it('attaches a flat commission split in major units when a subaccount is given', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ status: 'success', data: { link: 'https://flw/pay' } }));
    const out = await makeProvider().createCheckoutSession({
      ...base,
      subaccountCode: 'RS_ABC123',
      platformFeeMinor: 45_000n, // NGN 450.00
    });
    expect(out).toEqual({ sessionId: 'order-1', url: 'https://flw/pay' });
    const body = sentBody(fetchSpy);
    expect(body.amount).toBe(15000);
    expect(body.subaccounts).toEqual([
      { id: 'RS_ABC123', transaction_charge_type: 'flat', transaction_charge: 450 },
    ]);
  });

  it('converts a zero-decimal currency fee correctly (XOF has no minor unit)', async () => {
    // Canonical amounts are always major * 100 (AMOUNT_SCALE), even for XOF,
    // so 20,000 XOF is 2_000_000n and a 600 XOF fee is 60_000n. Flutterwave is
    // billed in major units, so both must come out as the plain XOF figures.
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ status: 'success', data: { link: 'https://flw/pay' } }));
    await makeProvider().createCheckoutSession({
      ...base,
      currency: 'XOF',
      amountMinor: 2_000_000n,
      subaccountCode: 'RS_XOF',
      platformFeeMinor: 60_000n,
    });
    const body = sentBody(fetchSpy);
    expect(body.amount).toBe(20000);
    expect((body.subaccounts as Array<{ transaction_charge: number }>)[0].transaction_charge).toBe(600);
  });

  it('omits subaccounts entirely when no split is requested', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ status: 'success', data: { link: 'https://flw/pay' } }));
    await makeProvider().createCheckoutSession(base);
    expect('subaccounts' in sentBody(fetchSpy)).toBe(false);
  });

  it('omits the split when a subaccount is given without a fee amount', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ status: 'success', data: { link: 'https://flw/pay' } }));
    await makeProvider().createCheckoutSession({ ...base, subaccountCode: 'RS_ABC123' });
    expect('subaccounts' in sentBody(fetchSpy)).toBe(false);
  });
});

/**
 * Onboarding helpers: bank list by country, holder-name resolve, and
 * collection-subaccount create returning the RS_ id used by the split.
 */
describe('FlutterwaveProvider onboarding', () => {
  afterEach(() => jest.restoreAllMocks());

  it('listBanks hits /v3/banks/{country} and maps name + code', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        status: 'success',
        data: [
          { id: 1, code: '044', name: 'Access Bank' },
          { id: 2, code: '058', name: 'GTBank' },
        ],
      }),
    );
    const banks = await makeProvider().listBanks('ng');
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/v3/banks/NG');
    expect(banks).toEqual([
      { name: 'Access Bank', code: '044' },
      { name: 'GTBank', code: '058' },
    ]);
  });

  it('resolveAccount POSTs account_number + account_bank and returns the holder', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({ status: 'success', message: 'ok', data: { account_name: 'Ada Obi' } }),
    );
    const out = await makeProvider().resolveAccount('0690000032', '044');
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/v3/accounts/resolve');
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      account_number: '0690000032',
      account_bank: '044',
    });
    expect(out).toEqual({ accountName: 'Ada Obi' });
  });

  it('resolveAccount throws when Flutterwave cannot verify the account', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ status: 'error', message: 'Invalid account' }));
    await expect(makeProvider().resolveAccount('0000', '044')).rejects.toThrow(
      /Could not verify/,
    );
  });

  it('createSubaccount sends a 0% default split and returns the RS_ id', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        status: 'success',
        message: 'Subaccount created',
        data: { id: 9530, subaccount_id: 'RS_FB312AA6' },
      }),
    );
    const out = await makeProvider().createSubaccount({
      businessName: 'Acme Events',
      businessMobile: '08012345678',
      businessEmail: 'org@x.test',
      bankCode: '044',
      accountNumber: '0690000037',
      country: 'ng',
    });
    expect(out).toEqual({ subaccountId: 'RS_FB312AA6' });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/v3/subaccounts');
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      account_bank: '044',
      account_number: '0690000037',
      business_name: 'Acme Events',
      business_mobile: '08012345678',
      business_email: 'org@x.test',
      country: 'NG',
      split_type: 'percentage',
      split_value: 0,
    });
  });

  it('createSubaccount throws on a declined create', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        status: 'error',
        message: 'A subaccount with the account number and bank already exists',
        data: null,
      }),
    );
    await expect(
      makeProvider().createSubaccount({
        businessName: 'Acme',
        businessMobile: '080',
        bankCode: '044',
        accountNumber: '0690000037',
        country: 'NG',
      }),
    ).rejects.toThrow(/already exists/);
  });
});
