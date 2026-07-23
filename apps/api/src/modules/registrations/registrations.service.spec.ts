import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
