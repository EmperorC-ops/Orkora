import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DiscountsService, DiscountCheckInput } from './discounts.service';

/**
 * Unit tests for DiscountsService. Prisma is a hand-rolled mock so we can drive
 * the public validation guards. The core amount math and validity checks are
 * static and pure, so they are tested directly without any mock.
 */

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    event: { findUnique: jest.fn(), findFirst: jest.fn() },
    ticketTier: { findFirst: jest.fn() },
    discountCode: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ...over,
  } as never;
}

function row(over: Partial<DiscountCheckInput> = {}): DiscountCheckInput {
  return {
    kind: 'percent',
    value: 20,
    currency: null,
    active: true,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    timesRedeemed: 0,
    ...over,
  };
}

describe('DiscountsService.computeDiscountMinor', () => {
  it('floors a percent discount', () => {
    // 20% of 10000 = 2000
    expect(DiscountsService.computeDiscountMinor('percent', 20, 10000n)).toBe(2000n);
    // 33% of 999 = 329.67 -> floor 329
    expect(DiscountsService.computeDiscountMinor('percent', 33, 999n)).toBe(329n);
  });

  it('caps a fixed discount at the subtotal', () => {
    // fixed 500 of 300 -> 300 (never exceeds subtotal)
    expect(DiscountsService.computeDiscountMinor('fixed', 500, 300n)).toBe(300n);
    // fixed 500 of 2000 -> 500
    expect(DiscountsService.computeDiscountMinor('fixed', 500, 2000n)).toBe(500n);
  });

  it('returns 0 for a non-positive subtotal', () => {
    expect(DiscountsService.computeDiscountMinor('percent', 50, 0n)).toBe(0n);
  });
});

describe('DiscountsService.checkValidity', () => {
  const now = new Date('2026-07-20T10:00:00Z');

  it('accepts a valid percent code (happy path)', () => {
    const out = DiscountsService.checkValidity(row(), now, 'NGN', 10000n);
    expect(out.ok).toBe(true);
    expect(out.discountMinor).toBe(2000n);
  });

  it('rejects an inactive code', () => {
    const out = DiscountsService.checkValidity(row({ active: false }), now, 'NGN', 10000n);
    expect(out.ok).toBe(false);
  });

  it('rejects a code expired by endsAt', () => {
    const out = DiscountsService.checkValidity(
      row({ endsAt: new Date('2026-07-19T00:00:00Z') }),
      now,
      'NGN',
      10000n,
    );
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/expired/i);
  });

  it('rejects a code not yet active by startsAt', () => {
    const out = DiscountsService.checkValidity(
      row({ startsAt: new Date('2026-07-21T00:00:00Z') }),
      now,
      'NGN',
      10000n,
    );
    expect(out.ok).toBe(false);
  });

  it('rejects a code that has been fully redeemed', () => {
    const out = DiscountsService.checkValidity(
      row({ maxRedemptions: 5, timesRedeemed: 5 }),
      now,
      'NGN',
      10000n,
    );
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/redeemed/i);
  });

  it('rejects a fixed code whose currency does not match the tier', () => {
    const out = DiscountsService.checkValidity(
      row({ kind: 'fixed', value: 500, currency: 'USD' }),
      now,
      'NGN',
      10000n,
    );
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/currency/i);
  });

  it('accepts a fixed code with a matching currency', () => {
    const out = DiscountsService.checkValidity(
      row({ kind: 'fixed', value: 500, currency: 'ngn' }),
      now,
      'NGN',
      10000n,
    );
    expect(out.ok).toBe(true);
    expect(out.discountMinor).toBe(500n);
  });

  it('accepts a fixed code with no currency against any tier currency', () => {
    const out = DiscountsService.checkValidity(
      row({ kind: 'fixed', value: 500, currency: null }),
      now,
      'USD',
      10000n,
    );
    expect(out.ok).toBe(true);
    expect(out.discountMinor).toBe(500n);
  });
});

describe('DiscountsService.validatePublic', () => {
  it('404s when the event is a draft', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue({
      id: 'e1',
      status: 'draft',
      organization: { status: 'active' },
    });
    const svc = new DiscountsService(prisma);
    await expect(
      svc.validatePublic('ABC123', { code: 'SAVE20', tierId: 't1', quantity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an unknown code', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue({
      id: 'e1',
      status: 'published',
      organization: { status: 'active' },
    });
    (prisma as any).ticketTier.findFirst.mockResolvedValue({ priceMinor: 5000, currency: 'NGN' });
    (prisma as any).discountCode.findUnique.mockResolvedValue(null);
    const svc = new DiscountsService(prisma);
    await expect(
      svc.validatePublic('ABC123', { code: 'NOPE', tierId: 't1', quantity: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns numbers for a valid percent code', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue({
      id: 'e1',
      status: 'published',
      organization: { status: 'active' },
    });
    (prisma as any).ticketTier.findFirst.mockResolvedValue({ priceMinor: 5000, currency: 'NGN' });
    (prisma as any).discountCode.findUnique.mockResolvedValue(
      row({ kind: 'percent', value: 20 }),
    );
    const svc = new DiscountsService(prisma);
    const out = await svc.validatePublic('abc123', {
      code: 'save20',
      tierId: 't1',
      quantity: 2,
    });
    // subtotal 5000*2 = 10000, 20% = 2000, total 8000
    expect(out).toEqual({
      valid: true,
      kind: 'percent',
      value: 20,
      discountMinor: 2000,
      subtotalMinor: 10000,
      totalMinor: 8000,
    });
    expect(typeof out.discountMinor).toBe('number');
  });
});
