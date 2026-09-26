import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentsRegistry } from './providers/registry';
import { PaymentPreferencesService } from './preferences.service';
import { accountIsReady, connectedAccountsEnabled } from './connected-accounts.config';
import type { PaymentMethodName } from './providers/types';

/**
 * Connected payout accounts, slice 2 backbone.
 *
 * Stores and reports the payout account an organization has connected with each
 * provider, and gates paid checkout on having a ready account once the gate is
 * enabled. The live provider onboarding calls (creating a Stripe Connect account
 * link, a Paystack or Flutterwave subaccount, and consuming account.updated
 * webhooks) are the follow-on: this service persists connections and enforces
 * the gate; it does not itself talk to the providers yet.
 */
@Injectable()
export class ConnectedAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentsRegistry,
    private readonly preferences: PaymentPreferencesService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Status of every enabled provider for an org: whether an account is
   * connected and whether it is ready to receive a split. Also reports whether
   * the gate is currently enforced.
   */
  async list(orgId: string) {
    const rows = await this.prisma.paymentConnectedAccount.findMany({
      where: { organizationId: orgId },
    });
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    const providers = this.registry.getEnabledNames().map((name) => {
      const row = byProvider.get(name);
      return {
        provider: name,
        connected: !!row,
        ready: row ? accountIsReady(row) : false,
        status: row?.status ?? 'none',
        accountRef: row?.accountRef ?? null,
        chargesEnabled: row?.chargesEnabled ?? false,
        payoutsEnabled: row?.payoutsEnabled ?? false,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
    return { gateEnabled: connectedAccountsEnabled(), providers };
  }

  /**
   * Record (or update) an org's connected account for a provider. This is the
   * manual / admin path used before the programmatic provider onboarding is
   * wired: an operator supplies the provider account reference. `active`
   * defaults to true, meaning the account is asserted ready to receive a split.
   */
  async record(
    orgId: string,
    actorUserId: string,
    input: { provider: string; accountRef: string; active?: boolean },
    requestId?: string,
  ) {
    if (!this.registry.has(input.provider as PaymentMethodName)) {
      throw new BadRequestException(`Provider ${input.provider} is not enabled on this server`);
    }
    const ref = input.accountRef.trim();
    if (!ref) throw new BadRequestException('An account reference is required');
    const active = input.active !== false;
    const status = active ? 'active' : 'pending';

    const existing = await this.prisma.paymentConnectedAccount.findUnique({
      where: { organizationId_provider: { organizationId: orgId, provider: input.provider } },
    });

    const row = await this.prisma.paymentConnectedAccount.upsert({
      where: { organizationId_provider: { organizationId: orgId, provider: input.provider } },
      create: {
        organizationId: orgId,
        provider: input.provider,
        accountRef: ref,
        status,
        chargesEnabled: active,
        payoutsEnabled: active,
      },
      update: {
        accountRef: ref,
        status,
        chargesEnabled: active,
        payoutsEnabled: active,
      },
    });

    await this.audit.record({
      organizationId: orgId,
      actorUserId,
      action: existing ? 'payment_connected_account.updated' : 'payment_connected_account.created',
      resourceType: 'payment_connected_account',
      resourceId: row.id,
      // Never log the raw account reference; record only the provider and state.
      metadata: { provider: input.provider, status },
      requestId,
    });

    return this.shape(row);
  }

  /** Disconnect a provider account for an org. */
  async disconnect(orgId: string, actorUserId: string, provider: string, requestId?: string) {
    const existing = await this.prisma.paymentConnectedAccount.findUnique({
      where: { organizationId_provider: { organizationId: orgId, provider } },
    });
    if (!existing) return;
    await this.prisma.paymentConnectedAccount.delete({
      where: { organizationId_provider: { organizationId: orgId, provider } },
    });
    await this.audit.record({
      organizationId: orgId,
      actorUserId,
      action: 'payment_connected_account.removed',
      resourceType: 'payment_connected_account',
      resourceId: existing.id,
      metadata: { provider },
      requestId,
    });
  }

  /** Whether an org has a ready connected account for a specific provider. */
  async isReadyFor(orgId: string, provider: string): Promise<boolean> {
    const row = await this.prisma.paymentConnectedAccount.findUnique({
      where: { organizationId_provider: { organizationId: orgId, provider } },
    });
    return row ? accountIsReady(row) : false;
  }

  /**
   * Guard used at checkout for a resolved provider. No-op while the gate is
   * disabled, so today's paid flows are unaffected. When enabled, a missing or
   * not-ready account blocks the checkout with a clear message.
   */
  async assertReadyForProvider(orgId: string, provider: string): Promise<void> {
    if (!connectedAccountsEnabled()) return;
    if (await this.isReadyFor(orgId, provider)) return;
    throw new BadRequestException(
      `This organization has not connected a ${provider} payout account yet, so it cannot sell paid tickets in this currency. Connect a payout account in Settings > Payments.`,
    );
  }

  /**
   * Guard by currency: resolves the provider the org would use for the currency,
   * then asserts readiness. No-op while the gate is disabled.
   */
  async assertCanSellPaid(orgId: string, currency: string): Promise<void> {
    if (!connectedAccountsEnabled()) return;
    const provider = await this.preferences.resolveForOrg(orgId, currency);
    if (!provider) {
      throw new BadRequestException('No payment provider is configured for this currency');
    }
    await this.assertReadyForProvider(orgId, provider);
  }

  private shape(row: {
    provider: string;
    accountRef: string;
    status: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    updatedAt: Date;
  }) {
    return {
      provider: row.provider,
      accountRef: row.accountRef,
      status: row.status,
      ready: accountIsReady(row),
      chargesEnabled: row.chargesEnabled,
      payoutsEnabled: row.payoutsEnabled,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
