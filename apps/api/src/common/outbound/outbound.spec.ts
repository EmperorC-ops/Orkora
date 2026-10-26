import { OutboundGuardService } from './outbound-guard.service';
import { MemoryRateCounter } from './rate-counter';
import { emailCapKey, ipCapKeys, rateLimitIpKey, requestIp } from './ip';
import { TurnstileService, honeypotTripped } from './turnstile';
import { assertSafeEnvelope, normalizeSmsDestination } from './text-safety';
import { InvitesService } from '../../modules/invites/invites.service';

function cfg(values: Record<string, unknown> = {}) {
  return { get: (k: string) => values[k], getOrThrow: (k: string) => values[k] ?? 'x' } as never;
}

describe('rateLimitIpKey', () => {
  it.each([
    ['1.2.3.4', '1.2.3.4'],
    ['::ffff:1.2.3.4', '1.2.3.4'],
    ['2c0f:f5c0:1:2:aaaa:bbbb:cccc:dddd', '2c0f:f5c0:0001:0002::/64'],
    ['2c0f:f5c0:1:2::1', '2c0f:f5c0:0001:0002::/64'],
    ['[2c0f:f5c0:1:2::9]', '2c0f:f5c0:0001:0002::/64'],
    ['garbage', 'unknown'],
    ['', 'unknown'],
  ])('%s -> %s', (raw, key) => {
    expect(rateLimitIpKey(raw)).toBe(key);
  });

  it('reads req.ip, never X-Forwarded-For', () => {
    expect(requestIp({ ip: '9.9.9.9', headers: { 'x-forwarded-for': '1.1.1.1' } } as never)).toBe('9.9.9.9');
    expect(requestIp(undefined)).toBe('unknown');
  });
});

describe('ipCapKeys and emailCapKey', () => {
  it('adds a /48 key at four times the limit for IPv6 only', () => {
    expect(ipCapKeys('1.2.3.4', 10, 60)).toEqual([{ name: 'ip', value: '1.2.3.4', limit: 10, windowSeconds: 60 }]);
    expect(ipCapKeys('2c0f:f5c0:1:2::9', 10, 60)).toEqual([
      { name: 'ip', value: '2c0f:f5c0:0001:0002::/64', limit: 10, windowSeconds: 60 },
      { name: 'ip48', value: '2c0f:f5c0:0001::/48', limit: 40, windowSeconds: 60 },
    ]);
    expect(ipCapKeys(undefined, 10, 60)).toEqual([]);
  });

  it('maps an address to the inbox it lands in', () => {
    expect(emailCapKey('A.Da+promo@Gmail.com')).toBe('ada@gmail.com');
    expect(emailCapKey('a.da@googlemail.com')).toBe('ada@gmail.com');
    expect(emailCapKey('first.last+x@company.ng')).toBe('first.last@company.ng');
  });
});

describe('OutboundGuardService', () => {
  const key = (value: string, limit = 2) => ({ name: 'email', value, limit, windowSeconds: 60 });

  it('allows up to the per-key limit, then refuses', async () => {
    const g = OutboundGuardService.withCounter(cfg(), new MemoryRateCounter());
    expect(await g.allow('otp', [key('a@x.co')])).toBe(true);
    expect(await g.allow('otp', [key('a@x.co')])).toBe(true);
    expect(await g.allow('otp', [key('a@x.co')])).toBe(false);
    expect(await g.allow('otp', [key('b@x.co')])).toBe(true);
  });

  it('keys are case-insensitive and separate per send kind', async () => {
    const g = OutboundGuardService.withCounter(cfg(), new MemoryRateCounter());
    await g.allow('otp', [key('A@x.co', 1)]);
    expect(await g.allow('otp', [key('a@X.co', 1)])).toBe(false);
    expect(await g.allow('invite', [key('a@x.co', 1)])).toBe(true);
  });

  it('refuses everything when the kill switch is on, and spends nothing', async () => {
    const counter = new MemoryRateCounter();
    const spy = jest.spyOn(counter, 'hit');
    const g = OutboundGuardService.withCounter(cfg({ OUTBOUND_SENDS_DISABLED: '1' }), counter);
    expect(g.disabled).toBe(true);
    expect(await g.allow('otp', [key('a@x.co')])).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('spends the global budget only on sends that passed their own keys', async () => {
    // 'registration' has no per-kind share, so only the overall cap applies.
    const g = OutboundGuardService.withCounter(cfg({ OUTBOUND_GLOBAL_HOURLY_CAP: 2 }), new MemoryRateCounter());
    expect(await g.allow('registration', [key('a@x.co', 1)])).toBe(true);
    expect(await g.allow('registration', [key('a@x.co', 1)])).toBe(false); // per-key refusal, no global spend
    expect(await g.allow('registration', [key('b@x.co', 1)])).toBe(true);
    expect(await g.allow('registration', [key('c@x.co', 1)])).toBe(false); // global cap of 2 reached
  });

  it('gives each kind only its share of the global cap, so one kind cannot starve the rest', async () => {
    const g = OutboundGuardService.withCounter(cfg({ OUTBOUND_GLOBAL_HOURLY_CAP: 20 }), new MemoryRateCounter());
    let otp = 0;
    for (let i = 0; i < 20; i++) if (await g.allow('otp', [key(`o${i}`, 5)])) otp++;
    expect(otp).toBe(7);
    let tickets = 0;
    for (let i = 0; i < 20; i++) if (await g.allow('ticket_email', [key(`t${i}`, 5)])) tickets++;
    expect(tickets).toBe(7);
  });

  it('allowBulk spends a daily budget atomically and refunds a refused request', async () => {
    const g = OutboundGuardService.withCounter(cfg(), new MemoryRateCounter());
    expect(await g.allowBulk('campaign', 'global', 600, 1000)).toBe(true);
    expect(await g.allowBulk('campaign', 'global', 600, 1000)).toBe(false);
    expect(await g.allowBulk('campaign', 'global', 400, 1000)).toBe(true);
  });

  it('halves every cap while the shared counter store is down', async () => {
    const counter = new MemoryRateCounter() as MemoryRateCounter & { degraded: boolean };
    Object.defineProperty(counter, 'degraded', { value: true });
    const g = OutboundGuardService.withCounter(cfg(), counter);
    expect(await g.allow('registration', [key('a@x.co', 4)])).toBe(true);
    expect(await g.allow('registration', [key('a@x.co', 4)])).toBe(true);
    expect(await g.allow('registration', [key('a@x.co', 4)])).toBe(false);
  });

  it('withinKeys ignores the global budget', async () => {
    const g = OutboundGuardService.withCounter(cfg({ OUTBOUND_GLOBAL_HOURLY_CAP: 1 }), new MemoryRateCounter());
    for (let i = 0; i < 5; i++) expect(await g.withinKeys('registration', [key(`ip${i}`, 1)])).toBe(true);
  });

  it('enforce() throws 429', async () => {
    const g = OutboundGuardService.withCounter(cfg(), new MemoryRateCounter());
    await g.enforce('otp', [key('a@x.co', 1)]);
    let status: number | undefined;
    try {
      await g.enforce('otp', [key('a@x.co', 1)]);
    } catch (e) {
      status = (e as { getStatus: () => number }).getStatus();
    }
    expect(status).toBe(429);
  });
});

describe('TurnstileService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const enabled = cfg({ TURNSTILE_SITE_KEY: 's', TURNSTILE_SECRET_KEY: 'k', APP_URL: 'https://orkora.events' });

  function reply(body: unknown, ok = true) {
    global.fetch = jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body }) as never;
  }

  it('is inert until both keys are set', async () => {
    const t = new TurnstileService(cfg({ TURNSTILE_SITE_KEY: 's' }));
    expect(t.enabled).toBe(false);
    expect((await t.verify(undefined)).ok).toBe(true);
  });

  it('refuses a missing or oversized token without calling Cloudflare', async () => {
    const t = new TurnstileService(enabled);
    global.fetch = jest.fn() as never;
    expect((await t.verify(undefined)).ok).toBe(false);
    expect((await t.verify('x'.repeat(3000))).ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('accepts a solved token from our host, with or without www', async () => {
    const t = new TurnstileService(enabled);
    reply({ success: true, hostname: 'orkora.events' });
    expect((await t.verify('tok', '1.2.3.4')).ok).toBe(true);
    reply({ success: true, hostname: 'www.orkora.events' });
    expect((await t.verify('tok')).ok).toBe(true);
  });

  it('refuses a token solved on another site', async () => {
    const t = new TurnstileService(enabled);
    reply({ success: true, hostname: 'evil.example' });
    expect((await t.verify('tok')).reason).toBe('hostname');
  });

  it('fails closed when Cloudflare errors or is unreachable', async () => {
    const t = new TurnstileService(enabled);
    reply({}, false);
    expect((await t.verify('tok')).ok).toBe(false);
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as never;
    expect((await t.verify('tok')).ok).toBe(false);
  });

  it('honeypot: only a filled value trips it', () => {
    const quiet = { warn: jest.fn() } as never;
    expect(honeypotTripped(undefined, 'x', quiet)).toBe(false);
    expect(honeypotTripped('', 'x', quiet)).toBe(false);
    expect(honeypotTripped('http://spam', 'x', quiet)).toBe(true);
  });
});

describe('envelope and SMS destination rules', () => {
  it('assertSafeEnvelope refuses lists, display names and header breaks', () => {
    expect(() => assertSafeEnvelope('a@x.co', 'Hello')).not.toThrow();
    expect(() => assertSafeEnvelope('a@x.co, b@y.co', 'Hello')).toThrow();
    expect(() => assertSafeEnvelope('Ada <a@x.co>', 'Hello')).toThrow();
    expect(() => assertSafeEnvelope('a@x.co', 'Hello\r\nBcc: b@y.co')).toThrow();
    expect(() => assertSafeEnvelope('a@x.co', '')).toThrow();
  });

  it.each([
    ['+2348012345678', '+2348012345678'],
    ['+234 801 234 5678', '+2348012345678'],
    ['+233201234567', '+233201234567'],
    ['+15555550123', null],
    ['08012345678', null],
    ['+44 7700 900123', null],
  ])('normalizeSmsDestination(%s) -> %s', (raw, out) => {
    expect(normalizeSmsDestination(raw)).toBe(out);
  });
});

describe('InvitesService caps', () => {
  function build() {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Acme' }) },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      invitation: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(async (a: { data: Record<string, unknown> }) => ({ id: 'i', ...a.data })),
      },
    };
    const notifications = { sendInviteEmail: jest.fn().mockResolvedValue(undefined) };
    const guard = OutboundGuardService.withCounter(cfg(), new MemoryRateCounter());
    const svc = new InvitesService(prisma as never, notifications as never, cfg({ APP_URL: 'https://orkora.events' }), guard);
    return { svc, prisma, notifications };
  }
  const invite = (email: string, invitedById = 'u-1') =>
    ({ organizationId: 'org-1', email, role: 'staff', invitedById }) as never;

  it('sends at most 3 invites a day to one address, leaving the pending one intact', async () => {
    const { svc, prisma, notifications } = build();
    for (let i = 0; i < 3; i++) await svc.create(invite('x@y.co'));
    let status: number | undefined;
    try {
      await svc.create(invite('x@y.co'));
    } catch (e) {
      status = (e as { getStatus: () => number }).getStatus();
    }
    expect(status).toBe(429);
    expect(notifications.sendInviteEmail).toHaveBeenCalledTimes(3);
    expect(prisma.invitation.deleteMany).toHaveBeenCalledTimes(3);
  });

  it('caps one organization at 30 invites a day', async () => {
    const { svc, notifications } = build();
    for (let i = 0; i < 30; i++) await svc.create(invite(`p${i}@y.co`, `u-${i}`));
    await expect(svc.create(invite('p99@y.co', 'u-99'))).rejects.toThrow(/limit/);
    expect(notifications.sendInviteEmail).toHaveBeenCalledTimes(30);
  });

  it('refuses an address list', async () => {
    const { svc } = build();
    await expect(svc.create(invite('a@x.co,b@y.co'))).rejects.toThrow(/valid email/);
  });
});
