import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { createRateCounter, type RateCounter } from './rate-counter';

/**
 * Caps on every message an outsider can make Orkora send.
 *
 * Each send kind has per-key caps (address, network, user, organization) and
 * one shared GLOBAL hourly cap, plus a kill switch. Order inside check():
 * kill switch, then counters. Callers do cheap validation and the CAPTCHA
 * before calling, so token-less junk never spends the budget.
 *
 * Env (all optional):
 *   OUTBOUND_SENDS_DISABLED      "1" stops every outsider-triggered email/SMS
 *   OUTBOUND_GLOBAL_HOURLY_CAP   shared cap across all kinds (default 3000)
 *   OUTBOUND_ALERT_HOURLY        alert threshold for the global count (default 1000)
 *   SIGNUP_ALERT_HOURLY          alert threshold for signups per hour (default 100)
 */

export type SendKind =
  | 'otp'
  | 'signup_notice'
  | 'ticket_email'
  | 'invite'
  | 'campaign_test'
  | 'resend_confirmations'
  | 'registration'
  | 'campaign';

/**
 * Each kind's share of the global hourly cap, so one kind (for example a
 * flood of sign-in codes) cannot use the whole budget and starve ticket
 * emails and real signups.
 */
// The shares add up to 100%, so the kinds together cannot exceed the cap and
// each kind keeps its own reserved part of it.
const KIND_SHARE: Partial<Record<SendKind, number>> = {
  otp: 0.35,
  ticket_email: 0.35,
  resend_confirmations: 0.15,
  signup_notice: 0.05,
  invite: 0.05,
  campaign_test: 0.05,
};

export interface CapKey {
  /** What the key is (shown in logs): "email", "ip", "user", "org". */
  name: string;
  value: string;
  limit: number;
  windowSeconds: number;
}

export class OutboundLimitError extends HttpException {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class OutboundGuardService {
  private readonly logger = new Logger('OutboundGuard');
  private counter: RateCounter;
  private readonly globalCap: number;
  private readonly alertHourly: number;
  private readonly signupAlertHourly: number;
  private readonly disabledFlag: () => boolean;
  private degradedAlerted = false;

  constructor(cfg: ConfigService) {
    this.counter = createRateCounter(cfg.get<string>('REDIS_URL'));
    this.globalCap = positive(cfg.get('OUTBOUND_GLOBAL_HOURLY_CAP'), 3000);
    this.alertHourly = positive(cfg.get('OUTBOUND_ALERT_HOURLY'), 1000);
    this.signupAlertHourly = positive(cfg.get('SIGNUP_ALERT_HOURLY'), 100);
    this.disabledFlag = () => String(cfg.get('OUTBOUND_SENDS_DISABLED') ?? '') === '1';
  }

  /** Tests: swap in a deterministic counter. */
  static withCounter(cfg: ConfigService, counter: RateCounter): OutboundGuardService {
    const g = new OutboundGuardService({ get: (k: string) => (k === 'REDIS_URL' ? undefined : cfg.get(k)) } as ConfigService);
    g.counter = counter;
    return g;
  }

  /** True when the kill switch is on. */
  get disabled(): boolean {
    return this.disabledFlag();
  }

  /**
   * Count this send against every key and the global cap. Returns true when it
   * may go out, false when a cap or the kill switch says no. Never throws for
   * a cap: callers decide whether to refuse loudly or skip silently (silent
   * for anything that must not reveal whether an account exists).
   */
  async allow(kind: SendKind, keys: CapKey[]): Promise<boolean> {
    if (this.disabled) {
      this.logger.warn(`Outbound ${kind} blocked by OUTBOUND_SENDS_DISABLED`);
      return false;
    }
    // The global hourly budget is only spent by sends that passed their own keys.
    if (!(await this.withinKeys(kind, keys))) return false;
    const hour = Math.floor(Date.now() / 3600_000);
    const share = KIND_SHARE[kind];
    if (share) {
      const kindCap = this.tighten(Math.max(1, Math.floor(this.globalCap * share)));
      const n = await this.counter.hit(`global:${kind}:${hour}`, 3600);
      if (n > kindCap) {
        if (n === kindCap + 1) this.alert(`Outbound ${kind} reached its hourly share of ${kindCap}`, { kind, n });
        return false;
      }
    }
    const total = await this.counter.hit(`global:${hour}`, 3600);
    if (total === this.alertHourly) {
      this.alert(`Outbound sends reached ${total} this hour (alert threshold)`, { kind, total });
    }
    const cap = this.tighten(this.globalCap);
    if (total > cap) {
      if (total === cap + 1) {
        this.alert(`Outbound global hourly cap of ${this.globalCap} reached; sends are being refused`, {
          kind,
          total,
        });
      }
      return false;
    }
    return true;
  }

  /**
   * Count against per-key caps only (no global budget, no kill switch). For
   * gates in front of work that may or may not end in a send, such as a
   * registration request per client network.
   */
  async withinKeys(kind: SendKind, keys: CapKey[]): Promise<boolean> {
    let ok = true;
    for (const k of keys) {
      if (!k.value) continue;
      const limit = this.tighten(k.limit);
      const n = await this.counter.hit(`${kind}:${k.name}:${k.value.toLowerCase()}`, k.windowSeconds);
      if (n > limit) {
        ok = false;
        if (n === limit + 1) {
          this.logger.warn(`Outbound ${kind} cap reached for ${k.name} (${limit}/${k.windowSeconds}s)`);
        }
      }
    }
    return ok;
  }

  /**
   * Spend `count` units of a daily budget at once (a campaign of N
   * recipients). Refused, and nothing spent, when it would go over `cap` or
   * the kill switch is on.
   */
  async allowBulk(kind: SendKind, key: string, count: number, cap: number): Promise<boolean> {
    if (this.disabled) return false;
    if (count <= 0) return true;
    const day = Math.floor(Date.now() / 86_400_000);
    const k = `${kind}:bulk:${key}:${day}`;
    const total = await this.counter.hit(k, 86_400, count);
    if (total > this.tighten(cap)) {
      await this.counter.hit(k, 86_400, -count);
      this.logger.warn(`Outbound ${kind} daily budget for ${key} would be exceeded (${total}/${cap})`);
      return false;
    }
    return true;
  }

  /** Give back units spent by allowBulk when the send did not go ahead. */
  async refundBulk(kind: SendKind, key: string, count: number): Promise<void> {
    if (count <= 0) return;
    const day = Math.floor(Date.now() / 86_400_000);
    await this.counter.hit(`${kind}:bulk:${key}:${day}`, 86_400, -count);
  }

  /**
   * While the shared counter store is down, counts are per process and reset
   * on restart, so every cap is halved and one alert is raised. Failing
   * closed instead would take signup and sign-in down whenever Redis blips.
   */
  private tighten(limit: number): number {
    if (!this.counter.degraded) {
      this.degradedAlerted = false;
      return limit;
    }
    if (!this.degradedAlerted) {
      this.degradedAlerted = true;
      this.alert('Outbound counters are running without Redis; caps are halved and per process', {});
    }
    return Math.max(1, Math.floor(limit / 2));
  }

  /** As allow(), but refuses with a 429 the caller's client can show. */
  async enforce(kind: SendKind, keys: CapKey[], message?: string): Promise<void> {
    if (!(await this.allow(kind, keys))) throw new OutboundLimitError(message);
  }

  /** Count a signup and alert once when the hourly volume looks like a bot. */
  async noteSignup(): Promise<void> {
    const hour = Math.floor(Date.now() / 3600_000);
    const n = await this.counter.hit(`signups:${hour}`, 3600);
    if (n === this.signupAlertHourly) {
      this.alert(`Signups reached ${n} this hour (alert threshold)`, { total: n });
    }
  }

  /** One Sentry event per threshold crossing, never one per request. */
  private alert(message: string, extra: Record<string, unknown>) {
    this.logger.error(message);
    Sentry.captureMessage(message, { level: 'warning', tags: { component: 'outbound' }, extra });
  }
}

function positive(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
