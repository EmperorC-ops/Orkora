import { Logger } from '@nestjs/common';
import type { SmsProvider } from '../tokens';
import { DEFAULT_SMS_COUNTRY_CODES, normalizeSmsDestination } from '../../../common/outbound/text-safety';

/** Countries Orkora may text, from SMS_ALLOWED_COUNTRY_CODES (comma list of calling codes). */
function allowedCountries(): string[] {
  const raw = process.env.SMS_ALLOWED_COUNTRY_CODES;
  const list = raw ? raw.split(',').map((c) => c.trim().replace(/^\+/, '')).filter((c) => /^\d{1,4}$/.test(c)) : [];
  return list.length ? list : DEFAULT_SMS_COUNTRY_CODES;
}

/** E.164 in an allowed country, or throw before any provider is called. */
function checkedDestination(to: string): string {
  const dest = normalizeSmsDestination(to, allowedCountries());
  if (!dest) throw new Error('Refused to send SMS: destination must be E.164 in an allowed country');
  return dest;
}

export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('ConsoleSms');
  async send(input: { to: string; body: string }): Promise<void> {
    checkedDestination(input.to);
    this.logger.log(`\n----- SMS -----\nTo: ${input.to}\n${input.body}\n----------------`);
  }
}

/**
 * Termii: best deliverability for NG, GH, KE, ZA. Pay per message.
 * Docs: https://developers.termii.com/sms
 */
export class TermiiSmsProvider implements SmsProvider {
  private readonly logger = new Logger('TermiiSms');
  constructor(
    private readonly apiKey: string,
    private readonly senderId = 'Orkora',
  ) {}

  async send(input: { to: string; body: string }): Promise<void> {
    const to = checkedDestination(input.to);
    const res = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        from: this.senderId,
        sms: input.body,
        type: 'plain',
        channel: 'generic',
        api_key: this.apiKey,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Termii send failed: ${res.status} ${detail}`);
      throw new Error(`Termii error ${res.status}`);
    }
  }
}

/**
 * Twilio: global fallback for markets Termii does not cover well.
 */
export class TwilioSmsProvider implements SmsProvider {
  private readonly logger = new Logger('TwilioSms');
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from = '+15555550000',
  ) {}

  async send(input: { to: string; body: string }): Promise<void> {
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const to = checkedDestination(input.to);
    const params = new URLSearchParams({ To: to, From: this.from, Body: input.body });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Twilio send failed: ${res.status} ${detail}`);
      throw new Error(`Twilio error ${res.status}`);
    }
  }
}
