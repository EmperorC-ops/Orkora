import { BadRequestException } from '@nestjs/common';
import { PaymentPreferencesService } from './preferences.service';
import { PaymentsRegistry } from './providers/registry';
import { AuditService } from '../audit/audit.service';

function makePrismaMock() {
  return {
    paymentProviderPreference: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };
}

function makeRegistry(opts: { enabled: string[]; pickFor?: string | null }): PaymentsRegistry {
  return {
    getEnabledNames: () => opts.enabled,
    has: (name: string) => opts.enabled.includes(name),
    pickForCurrency: () => opts.pickFor ?? null,
    resolve: jest.fn(),
  } as unknown as PaymentsRegistry;
}

function makeAudit(): { record: jest.Mock } {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

describe('PaymentPreferencesService', () => {
  it('rejects malformed currency codes', async () => {
    const prisma = makePrismaMock();
    const reg = makeRegistry({ enabled: ['stripe', 'paystack'] });
    const audit = makeAudit();
    const svc = new PaymentPreferencesService(
      prisma as unknown as never,
      reg,
      audit as unknown as AuditService,
    );
    await expect(svc.upsert('org-1', 'actor', 'usd1', 'stripe')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects unknown providers', async () => {
    const prisma = makePrismaMock();
    const reg = makeRegistry({ enabled: ['stripe'] });
    const audit = makeAudit();
    const svc = new PaymentPreferencesService(
      prisma as unknown as never,
      reg,
      audit as unknown as AuditService,
    );
    await expect(svc.upsert('org-1', 'actor', 'NGN', 'mystery')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('upserts and audits', async () => {
    const prisma = makePrismaMock();
    prisma.paymentProviderPreference.findUnique.mockResolvedValue(null);
    prisma.paymentProviderPreference.upsert.mockResolvedValue({
      id: 'p1',
      currency: 'NGN',
      provider: 'paystack',
      updatedAt: new Date('2026-05-04'),
    });
    const reg = makeRegistry({ enabled: ['stripe', 'paystack'] });
    const audit = makeAudit();
    const svc = new PaymentPreferencesService(
      prisma as unknown as never,
      reg,
      audit as unknown as AuditService,
    );
    const out = await svc.upsert('org-1', 'actor', 'ngn', 'paystack');
    expect(out).toEqual({
      currency: 'NGN',
      provider: 'paystack',
      updatedAt: '2026-05-04T00:00:00.000Z',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'payment_preference.created' }),
    );
  });

  it('resolveForOrg uses the override when valid', async () => {
    const prisma = makePrismaMock();
    prisma.paymentProviderPreference.findUnique.mockResolvedValue({
      provider: 'paystack',
    });
    const reg = makeRegistry({ enabled: ['stripe', 'paystack'] });
    const svc = new PaymentPreferencesService(
      prisma as unknown as never,
      reg,
      makeAudit() as unknown as AuditService,
    );
    expect(await svc.resolveForOrg('org-1', 'NGN')).toBe('paystack');
  });

  it('resolveForOrg falls back to registry default when no override', async () => {
    const prisma = makePrismaMock();
    prisma.paymentProviderPreference.findUnique.mockResolvedValue(null);
    const reg = makeRegistry({ enabled: ['stripe'], pickFor: 'stripe' });
    const svc = new PaymentPreferencesService(
      prisma as unknown as never,
      reg,
      makeAudit() as unknown as AuditService,
    );
    expect(await svc.resolveForOrg('org-1', 'USD')).toBe('stripe');
  });

  it('resolveForOrg falls back when override points at a disabled provider', async () => {
    const prisma = makePrismaMock();
    prisma.paymentProviderPreference.findUnique.mockResolvedValue({
      provider: 'paystack',
    });
    const reg = makeRegistry({ enabled: ['stripe'], pickFor: 'stripe' });
    const svc = new PaymentPreferencesService(
      prisma as unknown as never,
      reg,
      makeAudit() as unknown as AuditService,
    );
    expect(await svc.resolveForOrg('org-1', 'NGN')).toBe('stripe');
  });
});
