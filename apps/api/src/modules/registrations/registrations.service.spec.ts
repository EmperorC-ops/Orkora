import { ConflictException } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';
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

/**
 * checkIn admits a ticket via an atomic claim (updateMany ... WHERE
 * checkedInAt IS NULL), so two gates scanning the same QR at once cannot both
 * report a fresh admission (double-scan).
 */
describe('RegistrationsService.checkIn atomic claim', () => {
  function makeCheckinSvc(opts: { claimCount: number; reread?: Record<string, unknown> }) {
    const updateMany = jest.fn().mockResolvedValue({ count: opts.claimCount });
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'tk1',
        code: 'CODE',
        holderName: 'Holder',
        status: 'issued',
        checkedInAt: null,
        tier: { name: 'GA' },
        registration: { event: { id: 'evt1' } },
      })
      .mockResolvedValueOnce(opts.reread ?? null);
    const prisma = {
      event: { findFirst: jest.fn().mockResolvedValue({ id: 'evt1', title: 'T' }) },
      ticket: { findUnique, updateMany },
    };
    const signer = { verify: jest.fn().mockReturnValue({ t: 'tk1', e: 'evt1' }), sign: jest.fn() };
    const svc = new RegistrationsService(
      prisma as never,
      { get: jest.fn() } as never,
      { sendTicketConfirmationEmail: jest.fn() } as never,
      signer as never,
    );
    return { svc, updateMany, findUnique };
  }

  it('admits the winning scan (claim matched) as a fresh check-in', async () => {
    const { svc, updateMany } = makeCheckinSvc({ claimCount: 1 });
    const out = await svc.checkIn('org1', 'evt1', 'qr');
    expect(out.alreadyCheckedIn).toBe(false);
    expect(out.status).toBe('checked_in');
    expect(out.checkedInAt).toBeInstanceOf(Date);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tk1', checkedInAt: null, status: 'issued' },
        data: expect.objectContaining({ status: 'checked_in' }),
      }),
    );
  });

  it('reports already-checked-in for the losing scan (claim matched 0 rows)', async () => {
    const checkedInAt = new Date('2026-08-01T19:30:00.000Z');
    const { svc, findUnique } = makeCheckinSvc({
      claimCount: 0,
      reread: { id: 'tk1', status: 'checked_in', checkedInAt, tier: { name: 'GA' } },
    });
    const out = await svc.checkIn('org1', 'evt1', 'qr');
    expect(out.alreadyCheckedIn).toBe(true);
    expect(out.checkedInAt).toEqual(checkedInAt);
    // it re-read the authoritative row rather than admitting a second time
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

/**
 * Event-level capacity is enforced under the event row lock, so an uncapped
 * tier (quantity_total NULL) cannot oversell Event.capacity across its tiers.
 */
describe('RegistrationsService.register event capacity', () => {
  it('rejects a registration that would exceed Event.capacity', async () => {
    const { $transaction, tx } = basePrismaMocks({ paidOrder: null, pendingOrder: null });
    // event FOR UPDATE, then an uncapped tier FOR UPDATE
    (tx as unknown as { $queryRawUnsafe: jest.Mock }).$queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'evt1' }])
      .mockResolvedValueOnce([{ quantity_total: null, quantity_sold: 100 }]);
    (tx.ticketTier as unknown as { aggregate: jest.Mock }).aggregate = jest
      .fn()
      .mockResolvedValue({ _sum: { quantitySold: 100 } });
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue({ ...event, capacity: 100 }) },
      // free tier so the paid dedup guard is skipped and we reach the capacity check
      ticketTier: { findUnique: jest.fn().mockResolvedValue({ ...tier, priceMinor: 0n }) },
      $transaction,
    };
    const svc = makeSvc(prisma);
    jest
      .spyOn(
        svc as unknown as {
          upsertUserByEmail: (...args: unknown[]) => Promise<{ id: string; email: string }>;
        },
        'upsertUserByEmail',
      )
      .mockResolvedValue({ id: 'u1', email: 'a@b.co' });

    await expect(
      svc.register('TESTCODE', dto({ paymentMethod: 'free' })),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

/**
 * upsertUserByEmail must survive the find-then-create race two concurrent
 * registrations for the same new email create: the loser hits unique(email)
 * (P2002) and re-fetches instead of 500ing.
 */
describe('RegistrationsService.upsertUserByEmail race', () => {
  it('recovers from a concurrent-insert P2002 by re-fetching the winner row', async () => {
    const { Prisma } = require('@prisma/client');
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const raced = { id: 'u9', email: 'new@x.co', phone: '123' };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(raced),
        create: jest.fn().mockRejectedValue(p2002),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const svc = makeSvc(prisma);
    const out = await (
      svc as unknown as {
        upsertUserByEmail: (e: string, n: string, p?: string) => Promise<{ id: string }>;
      }
    ).upsertUserByEmail('New@X.co', 'New User');
    expect(prisma.user.create).toHaveBeenCalled();
    expect(out).toEqual(raced);
  });

  it('rethrows a non-P2002 create error', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(new Error('db down')),
        update: jest.fn(),
      },
    };
    const svc = makeSvc(prisma);
    await expect(
      (
        svc as unknown as {
          upsertUserByEmail: (e: string, n: string, p?: string) => Promise<{ id: string }>;
        }
      ).upsertUserByEmail('x@y.co', 'X Y'),
    ).rejects.toThrow('db down');
  });
});
