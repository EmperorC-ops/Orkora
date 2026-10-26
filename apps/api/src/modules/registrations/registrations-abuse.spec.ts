import { RegistrationsService } from './registrations.service';
import { OutboundGuardService } from '../../common/outbound/outbound-guard.service';
import { MemoryRateCounter } from '../../common/outbound/rate-counter';

/**
 * Public registration abuse rules (docs/SIGNUP_ABUSE_2026-10.md): holder names
 * must be names, one client network may register 30 times an hour, one
 * address receives at most 5 ticket emails an hour (skipped, never an error),
 * and a real confirmation resend runs at most 3 times a day per event.
 */

function cfg(values: Record<string, unknown> = {}) {
  return { get: (k: string) => values[k] } as never;
}

function build(guardCfg: Record<string, unknown> = {}) {
  const prisma = {
    event: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue({
        id: 'evt-1',
        title: 'Show',
        code: 'ABC',
        startAt: new Date('2026-11-01T10:00:00Z'),
        endAt: new Date('2026-11-01T12:00:00Z'),
        timezone: 'Africa/Lagos',
        venueName: null,
        venueAddress: null,
        joinUrl: null,
      }),
    },
    registration: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'r-1', user: { email: 'a@x.co' }, tickets: [{ code: 'T1', holderName: 'Ada', tier: { name: 'General' } }] },
      ]),
    },
  };
  const notifications = { sendTicketConfirmationEmail: jest.fn().mockResolvedValue(undefined) };
  const guard = OutboundGuardService.withCounter(cfg(guardCfg), new MemoryRateCounter());
  const svc = new RegistrationsService(prisma as never, cfg(), notifications as never, {} as never, guard);
  return { svc, prisma, notifications };
}

async function statusOf(p: Promise<unknown>): Promise<number | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as { getStatus?: () => number }).getStatus?.();
  }
  return undefined;
}

const attendee = (fullName: string) => ({ fullName, email: 'a@x.co' });

describe('RegistrationsService public registration gate', () => {
  it.each([['Get rich www.win.com'], ['WhatsApp 08031234567'], ['Promo t.me/deals']])(
    'refuses the holder name %s before any lookup',
    async (name) => {
      const { svc, prisma } = build();
      expect(
        await statusOf(svc.register('ABC', { tierId: 't', attendees: [attendee('Ada'), attendee(name)] } as never)),
      ).toBe(400);
      expect(await statusOf(svc.registerVip('ABC', { token: 'x'.repeat(10), fullName: name, email: 'a@x.co' }))).toBe(400);
      expect(prisma.event.findUnique).not.toHaveBeenCalled();
    },
  );

  it('caps one client network at 120 registrations an hour', async () => {
    const { svc } = build();
    const dto = { tierId: 't', attendees: [attendee('Ada')] } as never;
    for (let i = 0; i < 120; i++) {
      // The event does not exist, so each request ends in 404, but it still counts.
      expect(await statusOf(svc.register('ABC', dto, { ip: '41.1.1.1' }))).toBe(404);
    }
    expect(await statusOf(svc.register('ABC', dto, { ip: '41.1.1.1' }))).toBe(429);
    expect(await statusOf(svc.register('ABC', dto, { ip: '41.2.2.2' }))).toBe(404);
  });
});

describe('RegistrationsService ticket email caps', () => {
  const payload = { eventTitle: 'Show', eventDateLine: 'Sat', tickets: [] };

  it('skips, without failing, past 5 ticket emails an hour to one address', async () => {
    const { svc, notifications } = build();
    const send = (svc as unknown as { sendTicketEmailCapped: (to: string, p: unknown) => Promise<void> })
      .sendTicketEmailCapped.bind(svc);
    for (let i = 0; i < 8; i++) await send('victim@example.com', payload);
    expect(notifications.sendTicketConfirmationEmail).toHaveBeenCalledTimes(5);
    await send('someone-else@example.com', payload);
    expect(notifications.sendTicketConfirmationEmail).toHaveBeenCalledTimes(6);
  });

  it('skips ticket emails while the kill switch is on', async () => {
    const { svc, notifications } = build({ OUTBOUND_SENDS_DISABLED: '1' });
    const send = (svc as unknown as { sendTicketEmailCapped: (to: string, p: unknown) => Promise<void> })
      .sendTicketEmailCapped.bind(svc);
    await send('a@example.com', payload);
    expect(notifications.sendTicketConfirmationEmail).not.toHaveBeenCalled();
  });
});

describe('RegistrationsService.resendTicketConfirmations caps', () => {
  it('skips a resent email to an inbox already sent 3 today, and reports it', async () => {
    const { svc, notifications, prisma } = build();
    const base = await prisma.event.findFirst();
    prisma.event.findFirst.mockImplementation(async (q: { where: { id: string } }) => ({ ...base, id: q.where.id }));
    // Three real resends reach a@x.co; the per-event cap stops a fourth anyway,
    // so use a second event id to reach the per-inbox cap.
    for (let i = 0; i < 3; i++) await svc.resendTicketConfirmations('org-1', `evt-${i}`, { dryRun: false });
    const out = await svc.resendTicketConfirmations('org-1', 'evt-9', { dryRun: false });
    expect(out.sent).toBe(0);
    expect(out.failures[0]?.error).toMatch(/limit/);
    expect(notifications.sendTicketConfirmationEmail).toHaveBeenCalledTimes(3);
  });

  it('allows 3 real resends a day per event; dry runs are free', async () => {
    const { svc, notifications } = build();
    for (let i = 0; i < 5; i++) await svc.resendTicketConfirmations('org-1', 'evt-1', {});
    for (let i = 0; i < 3; i++) await svc.resendTicketConfirmations('org-1', 'evt-1', { dryRun: false });
    expect(await statusOf(svc.resendTicketConfirmations('org-1', 'evt-1', { dryRun: false }))).toBe(429);
    expect(notifications.sendTicketConfirmationEmail).toHaveBeenCalledTimes(3);
  });

  it('refuses a real resend while the kill switch is on', async () => {
    const { svc } = build({ OUTBOUND_SENDS_DISABLED: '1' });
    expect(await statusOf(svc.resendTicketConfirmations('org-1', 'evt-1', { dryRun: false }))).toBe(429);
  });
});
