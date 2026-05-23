import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketSigner } from '../registrations/ticket-signer';
import { AuditService } from '../audit/audit.service';
import { PaymentsRegistry } from './providers/registry';
import type { PaymentMethodName } from './providers/types';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
    private readonly registry: PaymentsRegistry,
    private readonly notifications: NotificationsService,
    private readonly signer: TicketSigner,
    private readonly audit: AuditService,
  ) {}

  /**
   * Returns the public list of payment methods the API is currently
   * configured to accept. The web app calls this once on the register page so
   * it can render the right CTA when keys are missing in dev.
   */
  listEnabledMethods(): PaymentMethodName[] {
    return this.registry.getEnabledNames();
  }

  /**
   * Pick the default provider for a tier currency. Used by the web register
   * page so it can call `startCheckout` without having to hardcode a name.
   */
  pickProviderForCurrency(currency: string): PaymentMethodName | null {
    return this.registry.pickForCurrency(currency);
  }

  /**
   * Initiate a refund. Caller has already gone through RolesGuard so we
   * trust the org context; we still verify the order belongs to the org.
   * The actual local-state flip to `refunded` happens in `markOrderRefunded`
   * when the provider posts the corresponding webhook back.
   */
  async refundOrder(input: {
    orgId: string;
    orderId: string;
    actorUserId: string;
    requestId?: string;
  }): Promise<{ ok: true }> {
    const order = await this.prisma.order.findFirst({
      where: { id: input.orderId, event: { organizationId: input.orgId } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'paid') {
      throw new BadRequestException(
        `Only paid orders can be refunded. Current status: ${order.status}`,
      );
    }
    if (!order.provider || !order.providerRef) {
      throw new BadRequestException('Order has no provider reference to refund');
    }
    const provider = this.registry.resolve(order.provider as PaymentMethodName);
    await provider.refund({
      providerRef: order.providerRef,
      amountMinor: BigInt(order.totalMinor),
      currency: order.currency,
    });
    this.logger.log({ orderId: order.id, provider: provider.name }, 'Refund initiated');
    await this.audit.record({
      organizationId: input.orgId,
      actorUserId: input.actorUserId,
      action: 'refund_initiated',
      resourceType: 'order',
      resourceId: order.id,
      metadata: {
        provider: provider.name,
        totalMinor: Number(order.totalMinor),
        currency: order.currency,
      },
      requestId: input.requestId,
    });
    return { ok: true };
  }

  /** Public read for the confirmation page to poll. */
  async getOrderStatus(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        event: { select: { title: true, code: true } },
        registration: {
          include: {
            tickets: { include: { tier: { select: { name: true } } } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return {
      id: order.id,
      status: order.status,
      currency: order.currency,
      totalMinor: Number(order.totalMinor),
      provider: order.provider,
      paidAt: order.paidAt,
      event: order.event,
      tickets:
        order.registration?.tickets.map((t) => ({
          id: t.id,
          code: t.code,
          holderName: t.holderName,
          status: t.status,
          tier: { name: t.tier.name },
        })) ?? [],
    };
  }

  /**
   * Mints a hosted-checkout URL for an existing pending order. We re-use any
   * URL we already created if the order is still pending and we already have
   * a `provider_ref`; otherwise we create a fresh session.
   */
  async createCheckoutForOrder(orderId: string): Promise<{ url: string; provider: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        event: true,
        registration: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'pending') {
      throw new BadRequestException(
        `Order is in status "${order.status}". Only pending orders can be paid.`,
      );
    }
    if (!order.provider) {
      throw new BadRequestException('Order has no payment provider set');
    }

    const provider = this.registry.resolve(order.provider as PaymentMethodName);

    const appUrl = this.cfg.get<string>('APP_URL') ?? 'http://localhost:3000';
    const successUrl = `${appUrl}/r/${order.id}/confirm?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/r/${order.id}/cancelled`;

    const session = await provider.createCheckoutSession({
      orderId: order.id,
      amountMinor: order.totalMinor,
      currency: order.currency,
      customerEmail: order.user.email,
      description: `${order.event.title} - registration`,
      successUrl,
      cancelUrl,
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: { providerRef: session.sessionId },
    });

    return { url: session.url, provider: provider.name };
  }

  /**
   * Verify-on-return settlement. Called by the confirmation page when the user
   * returns from the hosted checkout. We ask the provider directly whether the
   * transaction succeeded and settle the order synchronously, so a delayed or
   * missed webhook never strands a paid customer. Safe to call repeatedly: a
   * non-pending order short-circuits and `markOrderPaid` is idempotent.
   */
  async settleOrder(orderId: string): Promise<{ status: string }> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'pending' || !order.provider) {
      return { status: order.status };
    }

    const provider = this.registry.resolve(order.provider as PaymentMethodName);
    if (!provider.verifyTransaction) {
      return { status: order.status };
    }

    try {
      const result = await provider.verifyTransaction({
        orderId: order.id,
        providerRef: order.providerRef,
      });
      if (result.status === 'success') {
        await this.markOrderPaid(order.id, result.paidAt ?? new Date());
        return { status: 'paid' };
      }
      if (result.status === 'failed') {
        await this.markOrderFailed(order.id, 'verify: provider reported failure');
        return { status: 'failed' };
      }
      return { status: 'pending' };
    } catch (err) {
      this.logger.warn({ err, orderId }, 'verifyTransaction failed; leaving order pending');
      return { status: 'pending' };
    }
  }

  /**
   * Webhook entry point. The controller has already grabbed the raw body and
   * the signature header. We delegate to the right provider, then translate
   * the canonical outcome into a state transition.
   *
   * Idempotency happens at two layers:
   *   1. `webhook_events` table de-dupes by `(provider, provider_event_id)`.
   *      The unique constraint blocks any duplicate delivery from doing a
   *      second round of side effects.
   *   2. The order state machine itself is idempotent (paid -> paid no-ops).
   *      Layer 2 is the safety net if the ledger entry races a delivery.
   *
   * The function always returns 200 to the provider so it stops retrying;
   * "ignored" outcomes still ack.
   */
  async handleWebhook(
    providerName: PaymentMethodName,
    rawBody: Buffer,
    signature: string,
  ): Promise<{ ok: true; outcome: string }> {
    const provider = this.registry.resolve(providerName);
    const outcome = await provider.parseAndVerifyWebhook(rawBody, signature);

    if (outcome.type === 'ignored') {
      this.logger.debug({ reason: outcome.reason }, 'Webhook ignored');
      return { ok: true, outcome: 'ignored' };
    }

    // Layer 1: ledger insert. ON CONFLICT we are a duplicate; ack and return.
    try {
      await this.prisma.webhookEvent.create({
        data: {
          provider: provider.name,
          providerEventId: outcome.providerEventId,
          outcome: outcome.type,
        },
      });
    } catch (err) {
      // Prisma maps the unique constraint to P2002. Anything else is a real
      // error and should crash so the provider retries.
      const code = (err as { code?: string }).code;
      if (code === 'P2002') {
        this.logger.debug(
          { providerEventId: outcome.providerEventId, provider: provider.name },
          'Duplicate webhook delivery ignored',
        );
        return { ok: true, outcome: 'duplicate' };
      }
      throw err;
    }

    switch (outcome.type) {
      case 'paid':
        await this.markOrderPaid(outcome.orderId, outcome.paidAt);
        return { ok: true, outcome: 'paid' };
      case 'failed':
        await this.markOrderFailed(outcome.orderId, outcome.reason);
        return { ok: true, outcome: 'failed' };
      case 'refunded':
        await this.markOrderRefunded(outcome.orderId);
        return { ok: true, outcome: 'refunded' };
    }
  }

  // --- internal state transitions ---

  private async markOrderPaid(orderId: string, paidAt: Date): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        registration: { include: { tickets: { include: { tier: true } }, user: true } },
        event: true,
      },
    });
    if (!order) {
      this.logger.warn({ orderId }, 'Webhook for unknown order');
      return;
    }
    if (order.status === 'paid') {
      this.logger.debug({ orderId }, 'Webhook for already-paid order, ignoring');
      return;
    }
    if (order.status !== 'pending') {
      this.logger.warn({ orderId, status: order.status }, 'Webhook for non-pending order');
      return;
    }
    if (!order.registration) {
      this.logger.error({ orderId }, 'Order has no registration; cannot issue tickets');
      return;
    }

    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'paid', paidAt },
      }),
      this.prisma.registration.update({
        where: { id: order.registration.id },
        data: { status: 'confirmed' },
      }),
      this.prisma.ticket.updateMany({
        where: { registrationId: order.registration.id, status: 'pending' },
        data: { status: 'issued' },
      }),
    ]);

    // Confirmation email after the state flip succeeds.
    const tickets = order.registration.tickets;
    if (tickets.length > 0) {
      const appUrl = this.cfg.get<string>('APP_URL') ?? 'http://localhost:3000';
      await this.notifications
        .sendTicketConfirmationEmail(order.registration.user.email, {
          eventTitle: order.event.title,
          eventDateLine: formatDateRange(
            order.event.startAt,
            order.event.endAt,
            order.event.timezone,
          ),
          tickets: tickets.map((t) => ({
            code: t.code,
            holderName: t.holderName,
            tierName: t.tier.name,
            ticketUrl: `${appUrl}/t/${t.code}`,
          })),
        })
        .catch((err) => this.logger.warn({ err }, 'Failed to send paid-confirmation email'));
    }
  }

  private async markOrderFailed(orderId: string, reason?: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, registration: { include: { tickets: true } } },
    });
    if (!order) return;
    if (order.status !== 'pending') return;

    // Release the seat hold by decrementing tier sold counters, marking
    // tickets as cancelled, and flipping the order to failed.
    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.ticketTier.update({
          where: { id: item.tierId },
          data: { quantitySold: { decrement: item.quantity } },
        });
      }
      if (order.registration) {
        await tx.ticket.updateMany({
          where: { registrationId: order.registration.id, status: 'pending' },
          data: { status: 'cancelled' },
        });
        await tx.registration.update({
          where: { id: order.registration.id },
          data: { status: 'cancelled' },
        });
      }
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'failed' },
      });
    });
    this.logger.log({ orderId, reason }, 'Order marked failed and seats released');
  }

  private async markOrderRefunded(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;
    if (order.status === 'refunded') return;
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'refunded' },
    });
    this.logger.log({ orderId }, 'Order marked refunded');
  }

  /**
   * Cron-driven cleanup. Releases pending orders that have been hanging
   * around longer than `ORDER_HOLD_TTL_MIN`. Mirrors the failed path so the
   * tier inventory becomes available again.
   */
  async releaseStaleHolds(): Promise<{ released: number }> {
    const ttl = Number(this.cfg.get<number>('ORDER_HOLD_TTL_MIN') ?? 20);
    const cutoff = new Date(Date.now() - ttl * 60_000);
    const stale = await this.prisma.order.findMany({
      where: { status: 'pending', createdAt: { lt: cutoff } },
      select: { id: true },
      take: 50,
    });
    let released = 0;
    for (const o of stale) {
      try {
        await this.markOrderFailed(o.id, 'expired');
        released += 1;
      } catch (err) {
        this.logger.warn({ err, orderId: o.id }, 'Could not release stale order');
      }
    }
    if (released > 0) this.logger.log({ released }, 'Released stale pending orders');
    return { released };
  }
}

/**
 * Format an event's start/end as a single human line for the paid-confirmation
 * email, rendered in the event's own timezone. Mirrors the helper in
 * registrations.service.ts so the free-ticket and paid-ticket emails read
 * identically. Without `timeZone`, Intl renders in the server's zone (UTC in
 * prod), which silently shifts the displayed time.
 */
function formatDateRange(start: Date, end: Date, timeZone: string): string {
  const dayFmt: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone,
  };
  const timeFmt: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  };
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  if (dayKey(start) === dayKey(end)) {
    return `${start.toLocaleDateString('en-GB', dayFmt)}, ${start.toLocaleTimeString('en-GB', timeFmt)} - ${end.toLocaleTimeString('en-GB', timeFmt)}`;
  }
  return `${start.toLocaleDateString('en-GB', dayFmt)} - ${end.toLocaleDateString('en-GB', dayFmt)}`;
}
