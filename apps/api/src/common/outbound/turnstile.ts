import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Cloudflare Turnstile bot check for public forms that cause an email.
 *
 * Inert until BOTH TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set, so a
 * deploy is safe before the keys exist. Once enabled it fails closed: a
 * missing, oversized, invalid or wrong-hostname token is refused, and a
 * Cloudflare outage or timeout (5 seconds) refuses too.
 */
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2048;

export interface TurnstileOutcome {
  ok: boolean;
  reason?: string;
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger('Turnstile');

  constructor(private readonly cfg: ConfigService) {
    // Without both keys every public form that sends email has no bot check.
    // Say so loudly at boot in production rather than failing open quietly.
    if (!this.enabled && String(cfg.get('NODE_ENV') ?? '') === 'production') {
      this.logger.warn(
        'Turnstile is OFF: set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY (docs/SIGNUP_ABUSE_2026-10.md)',
      );
    }
  }

  get enabled(): boolean {
    return Boolean(this.cfg.get<string>('TURNSTILE_SITE_KEY') && this.cfg.get<string>('TURNSTILE_SECRET_KEY'));
  }

  /** Hostnames a solved token may come from: the web app's host (and www). */
  private allowedHostnames(): Set<string> {
    const hosts = new Set<string>();
    const add = (url?: string) => {
      if (!url) return;
      try {
        const h = new URL(url).hostname.toLowerCase();
        hosts.add(h);
        hosts.add(h.startsWith('www.') ? h.slice(4) : `www.${h}`);
      } catch {
        // ignore
      }
    };
    add(this.cfg.get<string>('APP_URL'));
    for (const extra of String(this.cfg.get<string>('TURNSTILE_ALLOWED_HOSTNAMES') ?? '').split(',')) {
      if (extra.trim()) hosts.add(extra.trim().toLowerCase());
    }
    return hosts;
  }

  async verify(token: unknown, remoteIp?: string): Promise<TurnstileOutcome> {
    if (!this.enabled) return { ok: true, reason: 'disabled' };
    if (typeof token !== 'string' || token.length === 0) return { ok: false, reason: 'missing' };
    if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'too-long' };
    try {
      const body = new URLSearchParams({
        secret: this.cfg.get<string>('TURNSTILE_SECRET_KEY') ?? '',
        response: token,
      });
      if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);
      const res = await fetch(SITEVERIFY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, reason: `http-${res.status}` };
      const data = (await res.json()) as { success?: boolean; hostname?: string };
      if (!data.success) return { ok: false, reason: 'rejected' };
      const host = String(data.hostname ?? '').toLowerCase();
      if (!this.allowedHostnames().has(host)) return { ok: false, reason: 'hostname' };
      return { ok: true };
    } catch (err) {
      this.logger.warn(`Turnstile verify failed closed: ${(err as Error).message}`);
      return { ok: false, reason: 'error' };
    }
  }

  /** Verify or refuse with a message the form can show. */
  async enforce(token: unknown, remoteIp?: string): Promise<void> {
    const out = await this.verify(token, remoteIp);
    if (!out.ok) {
      throw new ForbiddenException('Please complete the security check and try again.');
    }
  }
}

/**
 * Honeypot: a hidden field real people never fill. A filled honeypot is
 * logged (one stdout line, no database row) and the request is treated as a
 * bot by the caller.
 */
export function honeypotTripped(value: unknown, where: string, logger = new Logger('Honeypot')): boolean {
  if (value === undefined || value === null || value === '') return false;
  logger.warn(`Honeypot tripped on ${where}`);
  return true;
}
