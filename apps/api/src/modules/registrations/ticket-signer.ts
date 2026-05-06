import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Builds and verifies signed ticket payloads. The QR code rendered on the
 * attendee's device is the output of `sign(...)`. The scanner app POSTs that
 * string back, and this class verifies the signature, expiry, and shape
 * before any DB lookup happens.
 *
 * Format: base64url(JSON(payload)) + '.' + base64url(hmac-sha256)
 */
export interface TicketPayload {
  /** Ticket id */
  t: string;
  /** Event id */
  e: string;
  /** Issued-at unix seconds */
  iat: number;
  /** Optional expiry. Tickets without exp are valid until manually revoked. */
  exp?: number;
}

@Injectable()
export class TicketSigner {
  private readonly secret: Buffer;

  constructor(cfg: ConfigService) {
    this.secret = Buffer.from(cfg.getOrThrow<string>('TICKET_SIGNING_SECRET'), 'utf8');
  }

  sign(payload: Omit<TicketPayload, 'iat'> & Partial<Pick<TicketPayload, 'iat'>>): string {
    const full: TicketPayload = { iat: Math.floor(Date.now() / 1000), ...payload };
    const body = Buffer.from(JSON.stringify(full)).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  /**
   * Verifies the signature and basic shape. Returns the parsed payload if
   * valid, or null otherwise. Does not touch the DB.
   */
  verify(token: string): TicketPayload | null {
    const dot = token.indexOf('.');
    if (dot < 1 || dot >= token.length - 1) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    const expected = createHmac('sha256', this.secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    let parsed: TicketPayload;
    try {
      parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (typeof parsed.t !== 'string' || typeof parsed.e !== 'string') return null;
    if (parsed.exp && parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  }
}
