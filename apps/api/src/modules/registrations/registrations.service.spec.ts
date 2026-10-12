import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RegistrationsService, attendeesNotYetTicketed } from './registrations.service';
import type { RegisterAttendeesDto } from './dto/registration.dto';

/**
 * The duplicate-order guard added after the 2026-06-01 dry-run. Bug #114:
 * `register()` used to mint a fresh order + fresh ticket rows on every call
 * for the same (event, user), so a double-clicked "Continue to payment"
 * created three pending tickets and three Stripe Checkout sessions for what
 * should have been one purchase. The guard now:
 *
 *   - 409s if a paid (non-refunded) order already exists.
 *   - Reuses the existing pending order when the tier and quantity match.
 *   - 409s if a pending order exists with a different tier or quantity, so the
 *     user is asked to complete or wait, instead of being silently overwritten.
 */

function dto(overrides: Partial<RegisterAttendeesDto> = {}): RegisterAttendeesDto {
  return {
    tierId: 'tier-1',
    attendees: [
      { fullName: 'A B', email: 'a@b.co', phone: undefined },
    ],
    paymentMethod: 'stripe',
    ...overrides,
  } as RegisterAttendeesDto;
}

function basePrismaMocks(opts: {
  paidOrder?: Record<string, unknown> | null;
  pendingOrder?: Record<string, unknown> | null;
  registration?: Record<string, unknown>;
  existingTickets?: Array<Record<string, unknown>>;
  // Free-tier dedupe: the (event, user) registration found before issuing, with
  // its live tickets on the tier. Null (default) means a first registration.
  priorRegistration?: Record<string, unknown> | null;
}) {
  const findFirstPaid = jest.fn().mockResolvedValue(opts.paidOrder ?? null);
  const findFirstPending = jest.fn().mockResolvedValue(opts.pendingOrder ?? null);

  // Two findFirst calls happen: first for paid, then for pending. The mock
  // returns paid then pending in order.
  const orderFindFirst = jest
    .fn()
    .mockResolvedValueOnce(opts.paidOrder ?? null)
    .mockResolvedValueOnce(opts.pendingOrder ?? null);

  const tx = {
    order: {
      findFirst: orderFindFirst,
      create: jest.fn().mockResolvedValue({
        id: 'newOrder',
        status: 'pending',
        currency: 'USD',
        totalMinor: 1000n,
        provider: 'stripe',
        items: [{ tierId: 'tier-1', quantity: 1 }],
      }),
    },
    registration: {
      findUnique: jest.fn().mockResolvedValue(opts.priorRegistration ?? null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(opts.registration ?? { id: 'r1', status: 'pending' }),
      upsert: jest.fn().mockResolvedValue({ id: 'r1', status: 'pending' }),
      update: jest.fn().mockResolvedValue({}),
    },
    ticket: {
      findMany: jest.fn().mockResolvedValue(opts.existingTickets ?? []),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: `ticket-${Math.random()}`,
          ...data,
          issuedAt: new Date(),
        }),
      ),
    },
    ticketTier: {
      update: jest.fn().mockResolvedValue({}),
    },
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ quantity_total: 100, quantity_sold: 0 }]),
  };
  const $transaction = jest.fn().mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  return { $transaction, tx, findFirstPaid, findFirstPending };
}

function makeSvc(prisma: unknown) {
  const cfg = { get: jest.fn().mockReturnValue('https://app.example.com') };
  const notifications = {
    sendTicketConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  };
  // shapeTicket reaches signer.sign on the happy path; verify is reached on
  // QR check-in. The opaque-token contents do not matter for these specs;
  // mocking both methods keeps the factory total.
  const signer = {
    sign: jest.fn().mockReturnValue('stub.qr.token'),
    verify: jest.fn(),
  };
  return new RegistrationsService(
    prisma as never,
    cfg as never,
    notifications as never,
    signer as never,
  );
}

const event = {
  id: 'evt1',
  code: 'TESTCODE',
  status: 'published',
  endAt: new Date(Date.now() + 86_400_000),
  startAt: new Date(Date.now() + 86_400_000),
  timezone: 'UTC',
  title: 'T',
  organization: { status: 'active' },
};

const tier = {
  id: 'tier-1',
  eventId: 'evt1',
  priceMinor: 1000n,
  currency: 'USD',
  minPerOrder: 1,
  maxPerOrder: 10,
  saleStartsAt: null,
  saleEndsAt: null,
  name: 'Standard',
};

describe('RegistrationsService.register duplicate-order guard', () => {
  it('rejects a registration attempt when a paid order already exists', async () => {
    const { $transaction } = basePrismaMocks({
      paidOrder: { id: 'paid1' },
    });
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event) },
      ticketTier: { findUnique: jest.fn().mockResolvedValue(tier) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co' }) },
      // upsertUserByEmail uses prisma.user.upsert through the service.
      $transaction,
    };
    const svc = makeSvc(prisma);
    // upsertUserByEmail is private; the test just needs it to resolve.
    // Cast to a structurally typed alias so `spyOn` infers a concrete
    // method signature (its overloads collapse to `never` against the
    // bare `{ upsertUserByEmail: Function }` shape under recent @types/jest).
    const spyTarget = svc as unknown as {
      upsertUserByEmail: (...args: unknown[]) => Promise<{ id: string; email: string }>;
    };
    jest
      .spyOn(spyTarget, 'upsertUserByEmail')
      .mockResolvedValue({ id: 'u1', email: 'a@b.co' });

    await expect(svc.register('TESTCODE', dto())).rejects.toBeInstanceOf(ConflictException);
  });

  it('reuses the existing pending order when tier and quantity match', async () => {
    const existingPending = {
      id: 'pending1',
      status: 'pending',
      currency: 'USD',
      totalMinor: 1000n,
      provider: 'stripe',
      items: [{ tierId: 'tier-1', quantity: 1 }],
    };
    const existingTickets = [
      { id: 't1', orderId: 'pending1', code: 'AAA', holderName: 'A B', tierId: 'tier-1', status: 'pending' },
    ];
    const { $transaction, tx } = basePrismaMocks({
      paidOrder: null,
      pendingOrder: existingPending,
      registration: { id: 'r1', status: 'pending' },
      existingTickets,
    });
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event) },
      ticketTier: { findUnique: jest.fn().mockResolvedValue(tier) },
      $transaction,
    };
    const svc = makeSvc(prisma);
    // Cast to a structurally typed alias so `spyOn` infers a concrete
    // method signature (its overloads collapse to `never` against the
    // bare `{ upsertUserByEmail: Function }` shape under recent @types/jest).
    const spyTarget = svc as unknown as {
      upsertUserByEmail: (...args: unknown[]) => Promise<{ id: string; email: string }>;
    };
    jest
      .spyOn(spyTarget, 'upsertUserByEmail')
      .mockResolvedValue({ id: 'u1', email: 'a@b.co' });

    const result = await svc.register('TESTCODE', dto());

    // The reused order is returned, no new order is created.
    expect(result.order?.id).toBe('pending1');
    expect(tx.order.create).not.toHaveBeenCalled();
    expect(tx.ticket.create).not.toHaveBeenCalled();
    // Inventory is NOT bumped again - that would over-reserve seats.
    expect(tx.ticketTier.update).not.toHaveBeenCalled();
  });

  it('rejects with 409 when a pending order exists with a different quantity', async () => {
    const existingPending = {
      id: 'pending1',
      status: 'pending',
      currency: 'USD',
      totalMinor: 2000n,
      provider: 'stripe',
      items: [{ tierId: 'tier-1', quantity: 2 }], // user came back asking for 1
    };
    const { $transaction } = basePrismaMocks({ paidOrder: null, pendingOrder: existingPending });
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event) },
      ticketTier: { findUnique: jest.fn().mockResolvedValue(tier) },
      $transaction,
    };
    const svc = makeSvc(prisma);
    // Cast to a structurally typed alias so `spyOn` infers a concrete
    // method signature (its overloads collapse to `never` against the
    // bare `{ upsertUserByEmail: Function }` shape under recent @types/jest).
    const spyTarget = svc as unknown as {
      upsertUserByEmail: (...args: unknown[]) => Promise<{ id: string; email: string }>;
    };
    jest
      .spyOn(spyTarget, 'upsertUserByEmail')
      .mockResolvedValue({ id: 'u1', email: 'a@b.co' });

    await expect(svc.register('TESTCODE', dto())).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('RegistrationsService.register group minimum', () => {
  const groupTier = { ...tier, isGroup: true, groupSize: 4 };

  it('rejects an order below the group minimum', async () => {
    const { $transaction } = basePrismaMocks({ paidOrder: null, pendingOrder: null });
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event) },
      ticketTier: { findUnique: jest.fn().mockResolvedValue(groupTier) },
      $transaction,
    };
    const svc = makeSvc(prisma);
    const spyTarget = svc as unknown as {
      upsertUserByEmail: (...args: unknown[]) => Promise<{ id: string; email: string }>;
    };
    jest
      .spyOn(spyTarget, 'upsertUserByEmail')
      .mockResolvedValue({ id: 'u1', email: 'a@b.co' });

    // dto() defaults to a single attendee; groupSize is 4.
    await expect(svc.register('TESTCODE', dto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows an order that meets the group minimum', async () => {
    // Free group tier so the happy path stays simple (no payment provider).
    const freeGroupTier = { ...groupTier, priceMinor: 0n };
    const { $transaction } = basePrismaMocks({
      paidOrder: null,
      pendingOrder: null,
      registration: { id: 'r1', status: 'pending' },
    });
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event) },
      ticketTier: { findUnique: jest.fn().mockResolvedValue(freeGroupTier) },
      $transaction,
    };
    const svc = makeSvc(prisma);
    const spyTarget = svc as unknown as {
      upsertUserByEmail: (...args: unknown[]) => Promise<{ id: string; email: string }>;
    };
    jest
      .spyOn(spyTarget, 'upsertUserByEmail')
      .mockResolvedValue({ id: 'u1', email: 'a@b.co' });

    const four = Array.from({ length: 4 }, (_, i) => ({
      fullName: `P ${i}`,
      email: `p${i}@b.co`,
      phone: undefined,
    }));
    // Four attendees meets groupSize=4: the group-minimum gate must not throw.
    await expect(
      svc.register('TESTCODE', dto({ attendees: four, paymentMethod: 'free' })),
    ).resolves.toBeDefined();
  });
});

/**
 * Free-tier dedupe rule. Identity is normalised email + name, matched one to one,
 * so a real group sharing one email with different names is never collapsed.
 */
describe('attendeesNotYetTicketed', () => {
  const a = (fullName: string, email: string) => ({ fullName, email });
  const t = (holderName: string, holderEmail: string) => ({ holderName, holderEmail });

  it('drops an attendee who already holds a ticket (normalised case and spacing)', () => {
    expect(
      attendeesNotYetTicketed([a('  Ada   Obi ', 'ADA@x.co')], [t('Ada Obi', 'ada@x.co')]),
    ).toEqual([]);
  });

  it('keeps a genuinely new attendee and preserves submission order', () => {
    const out = attendeesNotYetTicketed(
      [a('Ada Obi', 'ada@x.co'), a('Bayo Ade', 'bayo@x.co'), a('Chi Eze', 'chi@x.co')],
      [t('Ada Obi', 'ada@x.co')],
    );
    expect(out.map((x) => x.fullName)).toEqual(['Bayo Ade', 'Chi Eze']);
  });

  it('never collapses different names that share one email (a real group)', () => {
    const out = attendeesNotYetTicketed(
      [a('Ada Obi', 'family@x.co'), a('Tobi Obi', 'family@x.co')],
      [t('Ada Obi', 'family@x.co')],
    );
    expect(out.map((x) => x.fullName)).toEqual(['Tobi Obi']);
  });

  it('matches one to one: two identical guests need two existing tickets', () => {
    expect(
      attendeesNotYetTicketed(
        [a('Guest', 'g@x.co'), a('Guest', 'g@x.co')],
        [t('Guest', 'g@x.co')],
      ),
    ).toHaveLength(1);
  });

  it('issues everyone when nothing is held yet', () => {
    expect(attendeesNotYetTicketed([a('Ada Obi', 'ada@x.co')], [])).toHaveLength(1);
  });
});

/**
 * Free-tier duplicate guard inside register(): a resubmission of the same
 * details must not issue tickets or consume seats, and a partial resubmission
 * issues only the new attendees. Existing tickets are never modified.
 */
describe('RegistrationsService.register free-tier duplicate guard', () => {
  const freeTier = { ...tier, priceMinor: 0n };
  const priorTicket = {
    id: 'tk1',
    code: 'PRIORCODE1',
    holderName: 'A B',
    holderEmail: 'a@b.co',
    status: 'issued',
    tierId: 'tier-1',
    issuedAt: new Date(),
  };

  function setup(prior: Record<string, unknown> | null) {
    const { $transaction, tx } = basePrismaMocks({
      paidOrder: null,
      pendingOrder: null,
      registration: { id: 'r1', status: 'confirmed' },
      priorRegistration: prior,
    });
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue(event) },
      ticketTier: { findUnique: jest.fn().mockResolvedValue(freeTier) },
      $transaction,
    };
    const svc = makeSvc(prisma);
    const spyTarget = svc as unknown as {
      upsertUserByEmail: (...args: unknown[]) => Promise<{ id: string; email: string }>;
    };
    jest.spyOn(spyTarget, 'upsertUserByEmail').mockResolvedValue({ id: 'u1', email: 'a@b.co' });
    const notifications = (svc as unknown as {
      notifications: { sendTicketConfirmationEmail: jest.Mock };
    }).notifications;
    return { svc, tx, notifications };
  }

  it('a pure resubmission issues nothing, bumps nothing, and re-sends the existing ticket', async () => {
    const { svc, tx, notifications } = setup({
      id: 'r1',
      status: 'confirmed',
      tickets: [priorTicket],
    });
    const out = await svc.register('TESTCODE', dto({ paymentMethod: 'free' }));
    expect(tx.ticket.create).not.toHaveBeenCalled();
    expect(tx.ticketTier.update).not.toHaveBeenCalled();
    expect(tx.registration.upsert).not.toHaveBeenCalled();
    expect(out.tickets.map((x) => x.code)).toEqual(['PRIORCODE1']);
    expect(notifications.sendTicketConfirmationEmail).toHaveBeenCalledWith(
      'a@b.co',
      expect.objectContaining({
        tickets: [expect.objectContaining({ code: 'PRIORCODE1' })],
      }),
    );
  });

  it('a partial resubmission issues and counts only the new attendee', async () => {
    const { svc, tx } = setup({ id: 'r1', status: 'confirmed', tickets: [priorTicket] });
    await svc.register(
      'TESTCODE',
      dto({
        paymentMethod: 'free',
        attendees: [
          { fullName: 'A B', email: 'a@b.co', phone: undefined },
          { fullName: 'New Guest', email: 'new@b.co', phone: undefined },
        ],
      }),
    );
    expect(tx.ticket.create).toHaveBeenCalledTimes(1);
    expect(tx.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ holderName: 'New Guest' }) }),
    );
    expect(tx.ticketTier.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantitySold: { increment: 1 } } }),
    );
  });

  it('a first registration is unchanged: everyone is issued', async () => {
    const { svc, tx } = setup(null);
    await svc.register('TESTCODE', dto({ paymentMethod: 'free' }));
    expect(tx.ticket.create).toHaveBeenCalledTimes(1);
    expect(tx.ticketTier.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantitySold: { increment: 1 } } }),
    );
  });
});

describe('RegistrationsService.checkInByCode', () => {
  const evt = { id: 'evt1' };
  function makeTicket(over: Record<string, unknown> = {}) {
    return {
      id: 't1',
      code: 'AB12CD',
      holderName: 'Jason Cole',
      status: 'issued',
      checkedInAt: null,
      tier: { name: 'General' },
      registration: { event: { id: 'evt1' } },
      ...over,
    };
  }

  it('404s when no ticket has that code for the event', async () => {
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const svc = makeSvc(prisma);
    await expect(svc.checkInByCode('org1', 'evt1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s when the ticket belongs to a different event', async () => {
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: {
        findUnique: jest
          .fn()
          .mockResolvedValue(makeTicket({ registration: { event: { id: 'other' } } })),
      },
    };
    const svc = makeSvc(prisma);
    await expect(svc.checkInByCode('org1', 'evt1', 'AB12CD')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('checks in a valid ticket, normalizing the typed code', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeTicket());
    const update = jest.fn().mockResolvedValue({
      id: 't1',
      code: 'AB12CD',
      holderName: 'Jason Cole',
      status: 'checked_in',
      checkedInAt: new Date(),
      tier: { name: 'General' },
    });
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: { findUnique, update },
    };
    const svc = makeSvc(prisma);
    // Lowercase with a stray space/dash: the service should normalize to AB12CD.
    const out = await svc.checkInByCode('org1', 'evt1', ' ab-12cd ');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'AB12CD' } }),
    );
    expect(out.alreadyCheckedIn).toBe(false);
    expect(out.status).toBe('checked_in');
  });

  it('is idempotent: an already checked-in ticket returns alreadyCheckedIn', async () => {
    const update = jest.fn();
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: {
        findUnique: jest
          .fn()
          .mockResolvedValue(makeTicket({ status: 'checked_in', checkedInAt: new Date() })),
        update,
      },
    };
    const svc = makeSvc(prisma);
    const out = await svc.checkInByCode('org1', 'evt1', 'AB12CD');
    expect(out.alreadyCheckedIn).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a refunded (void) ticket', async () => {
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: { findUnique: jest.fn().mockResolvedValue(makeTicket({ status: 'void' })) },
    };
    const svc = makeSvc(prisma);
    await expect(svc.checkInByCode('org1', 'evt1', 'AB12CD')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('RegistrationsService.checkInByTicketId', () => {
  const evt = { id: 'evt1' };
  function makeTicket(over: Record<string, unknown> = {}) {
    return {
      id: 't1',
      code: 'AB12CD',
      holderName: 'Jason Cole',
      status: 'issued',
      checkedInAt: null,
      tier: { name: 'General' },
      registration: { event: { id: 'evt1' } },
      ...over,
    };
  }

  it('rejects an empty ticket id without hitting the database', async () => {
    const findUnique = jest.fn();
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: { findUnique },
    };
    const svc = makeSvc(prisma);
    await expect(svc.checkInByTicketId('org1', 'evt1', '  ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('404s when no ticket with that id exists', async () => {
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const svc = makeSvc(prisma);
    await expect(svc.checkInByTicketId('org1', 'evt1', 'tX')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s when the ticket belongs to a different event', async () => {
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: {
        findUnique: jest
          .fn()
          .mockResolvedValue(makeTicket({ registration: { event: { id: 'other' } } })),
      },
    };
    const svc = makeSvc(prisma);
    await expect(svc.checkInByTicketId('org1', 'evt1', 't1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('checks in a valid ticket chosen from the roster', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeTicket());
    const update = jest.fn().mockResolvedValue({
      id: 't1',
      code: 'AB12CD',
      holderName: 'Jason Cole',
      status: 'checked_in',
      checkedInAt: new Date(),
      tier: { name: 'General' },
    });
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: { findUnique, update },
    };
    const svc = makeSvc(prisma);
    const out = await svc.checkInByTicketId('org1', 'evt1', ' t1 ');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' } }),
    );
    expect(out.alreadyCheckedIn).toBe(false);
    expect(out.status).toBe('checked_in');
  });

  it('is idempotent for an already checked-in ticket', async () => {
    const update = jest.fn();
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: {
        findUnique: jest
          .fn()
          .mockResolvedValue(makeTicket({ status: 'checked_in', checkedInAt: new Date() })),
        update,
      },
    };
    const svc = makeSvc(prisma);
    const out = await svc.checkInByTicketId('org1', 'evt1', 't1');
    expect(out.alreadyCheckedIn).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a refunded (void) ticket', async () => {
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: { findUnique: jest.fn().mockResolvedValue(makeTicket({ status: 'void' })) },
    };
    const svc = makeSvc(prisma);
    await expect(svc.checkInByTicketId('org1', 'evt1', 't1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

/**
 * Delivery-outage recovery. Ticket emails are fire-and-forget with no send
 * log, so this re-sends to confirmed registrations created since a moment the
 * operator supplies. Dry-run by default; only admitting tickets are included;
 * one failure must not abort the batch.
 */
describe('RegistrationsService.resendTicketConfirmations', () => {
  const evt = {
    id: 'evt1',
    title: 'Show',
    code: 'SHOW1',
    startAt: new Date('2026-10-10T10:00:00Z'),
    endAt: new Date('2026-10-10T12:00:00Z'),
    timezone: 'UTC',
    venueName: null,
    venueAddress: null,
    joinUrl: null,
  };
  function reg(id: string, email: string, ticketStatuses: string[]) {
    return {
      id,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      user: { email },
      tickets: ticketStatuses.map((status, i) => ({
        id: `${id}-t${i}`,
        code: `${id.toUpperCase()}${i}`,
        holderName: 'Ada',
        status,
        tier: { name: 'General' },
      })),
    };
  }
  function build(rows: unknown[], sendImpl?: jest.Mock) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      registration: { findMany },
    };
    const send = sendImpl ?? jest.fn().mockResolvedValue(undefined);
    const notifications = { sendTicketConfirmationEmail: send };
    const cfg = { get: jest.fn().mockReturnValue('https://app.example.com') };
    const signer = { sign: jest.fn(), verify: jest.fn() };
    const svc = new RegistrationsService(
      prisma as never,
      cfg as never,
      notifications as never,
      signer as never,
    );
    return { svc, send, findMany };
  }

  it('404s when the event is not in the org', async () => {
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(null) },
      registration: { findMany: jest.fn() },
    };
    const svc = makeSvc(prisma);
    await expect(svc.resendTicketConfirmations('org1', 'evt1', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects an unparseable since', async () => {
    const { svc } = build([]);
    await expect(
      svc.resendTicketConfirmations('org1', 'evt1', { since: 'yesterday-ish' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dry-runs by default: counts matches and sends nothing', async () => {
    const { svc, send } = build([reg('r1', 'a@x.test', ['issued'])]);
    const out = await svc.resendTicketConfirmations('org1', 'evt1', {});
    expect(out).toMatchObject({ dryRun: true, matched: 1, sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('applies since as a createdAt lower bound on the query', async () => {
    const { svc, findMany } = build([]);
    await svc.resendTicketConfirmations('org1', 'evt1', { since: '2026-10-01T00:00:00Z' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'confirmed',
          createdAt: { gte: new Date('2026-10-01T00:00:00Z') },
        }),
      }),
    );
  });

  it('sends to each confirmed registration with admitting tickets when dryRun is false', async () => {
    const { svc, send } = build([
      reg('r1', 'a@x.test', ['issued']),
      reg('r2', 'b@x.test', ['checked_in', 'issued']),
    ]);
    const out = await svc.resendTicketConfirmations('org1', 'evt1', { dryRun: false });
    expect(out).toMatchObject({ dryRun: false, matched: 2, sent: 2, failed: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(
      'b@x.test',
      expect.objectContaining({
        eventTitle: 'Show',
        tickets: expect.arrayContaining([
          expect.objectContaining({ code: 'R20', ticketUrl: 'https://app.example.com/t/R20' }),
        ]),
      }),
    );
  });

  it('skips a registration whose tickets are all non-admitting', async () => {
    // The query filters to issued/checked_in, so such a row arrives with no
    // tickets; it must not be emailed and must not count as matched.
    const { svc, send } = build([reg('r1', 'a@x.test', [])]);
    const out = await svc.resendTicketConfirmations('org1', 'evt1', { dryRun: false });
    expect(out).toMatchObject({ matched: 0, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('records a per-registration failure and continues the batch', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error('Postmark error 422'))
      .mockResolvedValueOnce(undefined);
    const { svc } = build(
      [reg('r1', 'a@x.test', ['issued']), reg('r2', 'b@x.test', ['issued'])],
      send,
    );
    const out = await svc.resendTicketConfirmations('org1', 'evt1', { dryRun: false });
    expect(out).toMatchObject({ matched: 2, sent: 1, failed: 1 });
    expect(out.failures).toEqual([
      { registrationId: 'r1', email: 'a@x.test', error: 'Postmark error 422' },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('RegistrationsService.undoCheckIn', () => {
  const evt = { id: 'evt1' };
  const checkedInTicket = {
    id: 't1',
    code: 'AB12CD',
    holderName: 'Jason Cole',
    status: 'checked_in',
    checkedInAt: new Date(),
    tier: { name: 'General' },
    registration: { event: { id: 'evt1' } },
  };

  it('reverts a checked-in ticket to issued', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 't1',
      code: 'AB12CD',
      holderName: 'Jason Cole',
      status: 'issued',
      checkedInAt: null,
      tier: { name: 'General' },
    });
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: { findUnique: jest.fn().mockResolvedValue(checkedInTicket), update },
    };
    const svc = makeSvc(prisma);
    const out = await svc.undoCheckIn('org1', 'evt1', 't1');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'issued', checkedInAt: null } }),
    );
    expect(out.status).toBe('issued');
    expect(out.undone).toBe(true);
  });

  it('rejects undoing a ticket that is not checked in', async () => {
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...checkedInTicket, status: 'issued', checkedInAt: null }),
        update: jest.fn(),
      },
    };
    const svc = makeSvc(prisma);
    await expect(svc.undoCheckIn('org1', 'evt1', 't1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('404s for a ticket in another event', async () => {
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(evt) },
      ticket: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...checkedInTicket, registration: { event: { id: 'other' } } }),
        update: jest.fn(),
      },
    };
    const svc = makeSvc(prisma);
    await expect(svc.undoCheckIn('org1', 'evt1', 't1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
