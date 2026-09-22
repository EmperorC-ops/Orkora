import { createHmac } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { PaystackProvider } from './paystack.provider';
import { FlutterwaveProvider } from './flutterwave.provider';

/**
 * Each provider must report the amount it actually captured, converted into
 * Orkora's canonical minor unit, on every settlement signal. The service-level
 * gate is only as good as this extraction: a provider that reported the raw
 * provider-unit figure would compare 5,000 against 500,000 and quarantine
 * every correct payment, and one that reported nothing would settle blind.
 *
 * Paystack reports the SMALLEST currency unit. Flutterwave reports MAJOR
 * units. Both land on the same canonical figure here.
 */

const SECRET = 'sk_test_paystack';

function paystack(): PaystackProvider {
  const cfg = { get: jest.fn().mockReturnValue(SECRET) } as unknown as ConfigService;
  return new PaystackProvider(cfg);
}

function flutterwave(): FlutterwaveProvider {
  const cfg = {
    get: jest.fn((k: string) => (k === 'FLUTTERWAVE_WEBHOOK_SECRET' ? 'hash_abc' : 'FLWSECK_test')),
  } as unknown as ConfigService;
  return new FlutterwaveProvider(cfg);
}

function signPaystack(body: string): string {
  return createHmac('sha512', SECRET).update(Buffer.from(body)).digest('hex');
}

describe('PaystackProvider.parseAndVerifyWebhook amount extraction', () => {
  it('converts the smallest-unit amount to the canonical minor unit', async () => {
    // NGN is two-decimal, so Paystack's 500000 kobo == NGN 5,000.00 == 500000
    // canonical. The identity here is a coincidence of the 2-decimal case and
    // is exactly why the zero-decimal case below is also pinned.
    const body = JSON.stringify({
      event: 'charge.success',
      id: 'evt_1',
      data: { reference: 'ord-1', status: 'success', amount: 500000, currency: 'NGN' },
    });
    const out = await paystack().parseAndVerifyWebhook(Buffer.from(body), signPaystack(body));
    expect(out).toMatchObject({ type: 'paid', amountMinor: 500000n, currency: 'NGN' });
  });

  it('scales a zero-decimal currency up to the canonical minor unit', async () => {
    // XOF has no subdivision: 1000 XOF from Paystack is 100000 canonical.
    const body = JSON.stringify({
      event: 'charge.success',
      id: 'evt_2',
      data: { reference: 'ord-2', status: 'success', amount: 1000, currency: 'XOF' },
    });
    const out = await paystack().parseAndVerifyWebhook(Buffer.from(body), signPaystack(body));
    expect(out).toMatchObject({ type: 'paid', amountMinor: 100000n, currency: 'XOF' });
  });

  it('refuses to report a settlement it cannot price', async () => {
    const body = JSON.stringify({
      event: 'charge.success',
      id: 'evt_3',
      data: { reference: 'ord-3', status: 'success' },
    });
    const out = await paystack().parseAndVerifyWebhook(Buffer.from(body), signPaystack(body));
    expect(out.type).toBe('ignored');
  });
});

describe('FlutterwaveProvider.parseAndVerifyWebhook amount extraction', () => {
  it('converts major units to the canonical minor unit', async () => {
    const body = JSON.stringify({
      event: 'charge.completed',
      data: { id: 99, tx_ref: 'ord-1', status: 'successful', amount: 5000, currency: 'NGN' },
    });
    const out = await flutterwave().parseAndVerifyWebhook(Buffer.from(body), 'hash_abc');
    expect(out).toMatchObject({ type: 'paid', amountMinor: 500000n, currency: 'NGN' });
  });

  it('refuses to report a settlement it cannot price', async () => {
    const body = JSON.stringify({
      event: 'charge.completed',
      data: { id: 99, tx_ref: 'ord-1', status: 'successful' },
    });
    const out = await flutterwave().parseAndVerifyWebhook(Buffer.from(body), 'hash_abc');
    expect(out.type).toBe('ignored');
  });

  it('still rejects a bad signature before looking at any amount', async () => {
    const body = JSON.stringify({
      event: 'charge.completed',
      data: { id: 99, tx_ref: 'ord-1', status: 'successful', amount: 5000, currency: 'NGN' },
    });
    await expect(
      flutterwave().parseAndVerifyWebhook(Buffer.from(body), 'wrong_hash'),
    ).rejects.toThrow();
  });
});
