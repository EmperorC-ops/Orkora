import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentsRegistry } from './providers/registry';
import type { PaymentMethodName } from './providers/types';

@Injectable()
export class PaymentPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentsRegistry,
    private readonly audit: AuditService,
  ) {}

  /**
   * List per-currency provider overrides for the org. Each row resolves to
   * (currency -> provider). If no override exists for a currency, the
   * registry default applies.
   */
  async list(orgId: string) {
    const rows = await this.prisma.paymentProviderPreference.findMany({
      where: { organizationId: orgId },
      orderBy: { currency: 'asc' },
    });
    return {
      enabledProviders: this.registry.getEnabledNames(),
      preferences: rows.map((r) => ({
        currency: r.currency,
        provider: r.provider,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  async upsert(
    orgId: string,
    actorUserId: string,
    currency: string,
    provider: string,
    requestId?: string,
  ) {
    const cur = currency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) {
      throw new BadRequestException('Currency must be a 3-letter ISO code');
    }
    if (!this.registry.has(provider as PaymentMethodName)) {
      throw new BadRequestException(`Provider ${provider} is not enabled on this server`);
    }

    const before = await this.prisma.paymentProviderPreference.findUnique({
      where: { organizationId_currency: { organizationId: orgId, currency: cur } },
    });

    const row = await this.prisma.paymentProviderPreference.upsert({
      where: { organizationId_currency: { organizationId: orgId, currency: cur } },
      create: { organizationId: orgId, currency: cur, provider },
      update: { provider },
    });

    await this.audit.record({
      organizationId: orgId,
      actorUserId,
      action: before ? 'payment_preference.updated' : 'payment_preference.created',
      resourceType: 'payment_preference',
      resourceId: row.id,
      metadata: { currency: cur, before: before?.provider, after: provider },
      requestId,
    });

    return {
      currency: row.currency,
      provider: row.provider,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async remove(
    orgId: string,
    actorUserId: string,
    currency: string,
    requestId?: string,
  ) {
    const cur = currency.toUpperCase();
    const existing = await this.prisma.paymentProviderPreference.findUnique({
      where: { organizationId_currency: { organizationId: orgId, currency: cur } },
    });
    if (!existing) return;
    await this.prisma.paymentProviderPreference.delete({
      where: { organizationId_currency: { organizationId: orgId, currency: cur } },
    });
    await this.audit.record({
      organizationId: orgId,
      actorUserId,
      action: 'payment_preference.removed',
      resourceType: 'payment_preference',
      resourceId: existing.id,
      metadata: { currency: cur, provider: existing.provider },
      requestId,
    });
  }

  /**
   * Resolve the effective provider for an org + currency. Falls back to the
   * registry's default ordering when no override exists. Used by the
   * payments service when starting checkout.
   */
  async resolveForOrg(orgId: string, currency: string): Promise<PaymentMethodName | null> {
    const cur = currency.toUpperCase();
    const override = await this.prisma.paymentProviderPreference.findUnique({
      where: { organizationId_currency: { organizationId: orgId, currency: cur } },
    });
    if (override && this.registry.has(override.provider as PaymentMethodName)) {
      return override.provider as PaymentMethodName;
    }
    return this.registry.pickForCurrency(cur);
  }
}
