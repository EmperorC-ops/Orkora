import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { orderActivity } from '../../common/order-activity';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketSigner } from '../registrations/ticket-signer';
import { AuditService } from '../audit/audit.service';
import { PaymentsRegistry } from './providers/registry';
import { PaymentPreferencesService } from './preferences.service';
import { formatMoney } from './money';
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
    private readonly preferences: PaymentPreferencesService,
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
   *
   * Settlement is verify-on-action, mirroring verify-on-return for payments:
   * most card refunds settle synchronously, so when the provider reports
   * `succeeded` we flip the order to `refunded` immediately rather than waiting
   * for the async webhook. We always stamp `refundInitiatedAt` first so that a
   * `pending` (slow bank) refund, or one whose synchronous result we could not
   * read, is still finished by `reconcileRefunds` or the webhook. A provider
   * that declines the refund synchronously leaves the order `paid`.
   */
  async refundOrder(input: {
    orgId: string;
    orderId: string;
    actorUserId: string;
    requestId?: string;
  }): Promise<{ ok: true; status: 'refunded' | 'pending' }> {
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

    // Atomically claim the refund BEFORE calling the provider. Only a paid order
    // with no in-flight refund can be claimed, so two concurrent requests, or a
    // repeat click after a pending (bank-backed) refund, cannot issue a second
    // provider refund. If the claim fails, a refund is already in progress.
    const claim = await this.prisma.order.updateMany({
      where: { id: order.id, status: 'paid', refundInitiatedAt: null },
      data: { refundInitiatedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new BadRequestException('A refund is already in progress for this order.');
    }

    const provider = this.registry.resolve(order.provider as PaymentMethodName);
    let result: Awaited<ReturnType<typeof provider.refund>>;
    try {
      result = await provider.refund({
        providerRef: order.providerRef,
        amountMinor: BigInt(order.totalMinor),
        currency: order.currency,
      });
    } catch (err) {
      // The provider call threw: release the claim so a genuine retry is possible.
      await this.prisma.order.update({
        where: { id: order.id },
        data: { refundInitiatedAt: null },
      });
      throw err;
    }

    if (result.status === 'failed') {
      // Release the claim so the order can be retried after a declined refund.
      await this.prisma.order.update({
        where: { id: order.id },
        data: { refundInitiatedAt: null },
      });
      this.logger.warn(
        { orderId: order.id, provider: provider.name },
        'Provider declined the refund',
      );
      await this.audit.record({
        organizationId: input.orgId,
        actorUserId: input.actorUserId,
        action: 'refund_failed',
        resourceType: 'order',
        resourceId: order.id,
        metadata: { provider: provider.name, reason: 'provider declined' },
        requestId: input.requestId,
      });
      throw new BadRequestException('The payment provider declined the refund');
    }

    // The in-flight marker was set by the atomic claim above.
    this.logger.log(
      { orderId: order.id, provider: provider.name, result: result.status },
      'Refund initiated',
    );
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
        result: result.status,
      },
      requestId: input.requestId,
    });

    // Verify-on-action: a synchronously-settled refund flips the order now, so
    // the organizer sees "Refunded" without depending on the webhook arriving.
    if (result.status === 'succeeded') {
      await this.markOrderRefunded(order.id);
      return { ok: true, status: 'refunded' };
    }
    return { ok: true, status: 'pending' };
  }

  /**
   * Manual refund re-check for the dashboard. Asks the provider whether the
   * order's charge has actually been refunded and settles it locally if so.
   * Unlike `reconcileRefunds`, this does NOT require `refundInitiatedAt` to be
   * set, so it also rescues a refund that was issued before that marker existed
   * (e.g. a refund done on the provider while the local order is still `paid`).
   * Org-scoped and idempotent: an already-refunded order short-circuits, and a
   * paid order with no upstream refund simply stays `paid`.
   */
  async recheckRefund(input: {
    orgId: string;
    orderId: string;
    actorUserId: string;
    requestId?: string;
  }): Promise<{ status: 'refunded' | 'pending' | 'paid' }> {
    const order = await this.prisma.order.findFirst({
      where: { id: input.orderId, event: { organizationId: input.orgId } },
      select: { id: true, status: true, provider: true, providerRef: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'refunded') return { status: 'refunded' };
    if (order.status !== 'paid') {
      throw new BadRequestException(
        `Only paid orders can be re-checked for a refund. Current status: ${order.status}`,
      );
    }
    if (!order.provider || !order.providerRef) {
      throw new BadRequestException('Order has no provider reference to re-check');
    }
    const provider = this.registry.resolve(order.provider as PaymentMethodName);
    if (!provider.verifyRefund) {
      throw new BadRequestException(`${provider.name} cannot verify refunds`);
    }
    const { status } = await provider.verifyRefund({ providerRef: order.providerRef });
    if (status === 'succeeded') {
      await this.markOrderRefunded(order.id);
      await this.audit.record({
        organizationId: input.orgId,
        actorUserId: input.actorUserId,
        action: 'refund_rechecked',
        resourceType: 'order',
        resourceId: order.id,
        metadata: { provider: provider.name, result: 'settled' },
        requestId: input.requestId,
      });
      return { status: 'refunded' };
    }
    this.logger.log(
      { orderId: order.id, provider: provider.name, result: status },
      'Manual refund re-check found no settled refund',
    );
    return { status: 'paid' };
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
    // Checkout in flight: keep the maintenance sweeps armed for this order.
    orderActivity.touch();
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
    // Resolve the provider authoritatively from the org's per-currency
    // preference (Settings > Payments), falling back to the regional default.
    // We do not trust the provider chosen at registration time, so an org
    // override actually takes effect and the client cannot force a provider.
    const providerName = await this.preferences.resolveForOrg(
      order.event.organizationId,
      order.currency,
    );
    if (!providerName) {
      throw new BadRequestException('No payment provider is configured for this currency');
    }
    const provider = this.registry.resolve(providerName);

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
      data: { providerRef: session.sessionId, provider: providerName },
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
        items: { include: { tier: { select: { name: true } } } },
        event: { include: { organization: { select: { name: true } } } },
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

    // Scope the ticket flip to THIS order's tickets when the link exists
    // (tickets.order_id, added in migration 0004). Falling back to the
    // registration-wide scope is only safe for legacy tickets that predate
    // the column; otherwise a paid order would flip sibling pending tickets
    // (from abandoned attempts) to 'issued' and the confirmation email below
    // would mail QR codes the buyer never paid for. Dry-run 2026-06-01 fix.
    const hasOrderLink = order.registration.tickets.some((t) => t.orderId === orderId);
    const ticketScope = hasOrderLink
      ? { orderId, status: 'pending' as const }
      : { registrationId: order.registration.id, status: 'pending' as const };

    // Send the order-side emails only if no path has already sent them. The
    // notification_log insert lives inside the same transaction as the order
    // flip so a competing settle path (verify-on-action + webhook + reconcile)
    // sees the unique-violation and silently skips its send. We choose the
    // `paid` kind for the combined receipt + ticket pair so both arrive
    // exactly once together.
    let shouldSendPaidEmail = false;
    try {
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
          where: ticketScope,
          data: { status: 'issued' },
        }),
        this.prisma.notificationLog.create({
          data: { orderId, kind: 'paid' },
        }),
      ]);
      shouldSendPaidEmail = true;
    } catch (err) {
      // Unique violation on notification_log means another path already won
      // the race and shipped the email. The state flip above also rolled back
      // with the txn, so we re-run the flip without the log insert.
      const isUniqueViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!isUniqueViolation) throw err;
      this.logger.log({ orderId }, 'Paid email already sent for this order by another path');
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
          where: ticketScope,
          data: { status: 'issued' },
        }),
      ]);
    }

    if (!shouldSendPaidEmail) return;

    // Confirmation email after the state flip succeeds. Filter to THIS order's
    // tickets when the link is set; sibling tickets from other attempts must
    // not appear in the email, since the buyer did not pay for them.
    const allTickets = order.registration.tickets;
    const tickets = hasOrderLink
      ? allTickets.filter((t) => t.orderId === orderId)
      : allTickets;
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

    // Receipt (financial record), emailed alongside the ticket confirmation.
    await this.notifications
      .sendReceiptEmail(order.registration.user.email, {
        orderId: order.id,
        eventTitle: order.event.title,
        orgName: order.event.organization.name,
        paidAtLine: new Intl.DateTimeFormat('en-GB', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: order.event.timezone,
        }).format(paidAt),
        provider: order.provider ?? 'unknown',
        totalFormatted: formatMoney(order.totalMinor, order.currency),
        lines: order.items.map((it) => ({
          description: it.tier.name,
          quantity: it.quantity,
          amount: formatMoney(BigInt(it.unitPriceMinor) * BigInt(it.quantity), order.currency),
        })),
      })
      .catch((err) => this.logger.warn({ err }, 'Failed to send receipt email'));
  }

  private async markOrderFailed(orderId: string, reason?: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, registration: { include: { tickets: true } } },
    });
    if (!order) return;
    if (order.status !== 'pending') return;

    // Scope ticket cancel to THIS order's tickets when the link is set
    // (migration 0004). The registration-wide scope is only safe for legacy
    // tickets without an orderId; otherwise this failed/expired order would
    // cancel sibling pending tickets from a fresh attempt that the user is
    // about to pay for. Likewise, only flip the registration to 'cancelled'
    // when no other paid or in-flight orders exist on it.
    const ticketsHaveOrderLink = order.registration?.tickets.some((t) => t.orderId === orderId) ?? false;
    const ticketCancelScope = ticketsHaveOrderLink
      ? { orderId, status: 'pending' as const }
      : order.registration
      ? { registrationId: order.registration.id, status: 'pending' as const }
      : null;

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.ticketTier.update({
          where: { id: item.tierId },
          data: { quantitySold: { decrement: item.quantity } },
        });
      }
      // Release the discount slot claimed when this order was created, so a
      // failed or expired order does not permanently consume a limited code's
      // redemption cap. Guarded by the `status === 'pending'` check above, so it
      // runs exactly once per order (no double-decrement). Clamped at zero.
      if (order.discountCodeId) {
        await tx.$executeRawUnsafe(
          'delete from discount_redemptions where order_id = $1::uuid',
          orderId,
        );
        await tx.$executeRawUnsafe(
          'update discount_codes set times_redeemed = case when times_redeemed > 0 then times_redeemed - 1 else 0 end where id = $1::uuid',
          order.discountCodeId,
        );
      }
      if (ticketCancelScope) {
        await tx.ticket.updateMany({
          where: ticketCancelScope,
          data: { status: 'cancelled' },
        });
      }
      if (order.registration) {
        // Only flip the registration to 'cancelled' if no surviving paid or
        // in-flight orders remain on it. This stops a single failed attempt
        // from clobbering a sibling order's confirmed status.
        const surviving = await tx.order.count({
          where: {
            registrationId: order.registration.id,
            id: { not: orderId },
            status: { in: ['pending', 'paid'] },
          },
        });
        if (surviving === 0) {
          await tx.registration.update({
            where: { id: order.registration.id },
            data: { status: 'cancelled' },
          });
        }
      }
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'failed' },
      });
    });
    this.logger.log({ orderId, reason }, 'Order marked failed and seats released');
  }

  /**
   * Idempotent flip to `refunded`. Called from every settlement path (the
   * verify-on-action result in refundOrder, the provider webhook, and the
   * reconciliation sweep), so it records a single `refund_settled` audit event
   * regardless of which path won the race. A no-op for an already-refunded
   * order, so duplicate webhook + reconcile + sync settlement do not double-log.
   *
   * On settlement we also:
   *
   *  - VOID this order's tickets (status='void'), so the QR codes mailed to
   *    the attendee no longer admit at check-in. We scope by tickets.order_id
   *    when set, falling back to the registration scope for legacy rows.
   *  - Send a refund-confirmation email to the buyer, exactly once per order,
   *    guarded by an INSERT into notification_log (orderId, 'refund') in the
   *    same transaction that flips the order. A competing path that tries to
   *    send the same email hits the unique constraint and skips.
   */
  private async markOrderRefunded(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        event: { include: { organization: { select: { name: true } } } },
        registration: {
          include: {
            user: true,
            tickets: { select: { id: true, orderId: true, status: true } },
          },
        },
      },
    });
    if (!order) return;
    if (order.status === 'refunded') return;

    // Decide ticket void scope the same way markOrderPaid decides the issue
    // scope, so behavior is symmetric.
    const ticketsHaveOrderLink = order.registration?.tickets.some((t) => t.orderId === orderId) ?? false;
    const ticketVoidScope = ticketsHaveOrderLink
      ? { orderId, status: { not: 'cancelled' } }
      : order.registration
      ? { registrationId: order.registration.id, status: { not: 'cancelled' } }
      : null;

    let shouldSendRefundEmail = false;
    try {
      const ops: Prisma.PrismaPromise<unknown>[] = [
        this.prisma.order.update({
          where: { id: orderId },
          data: { status: 'refunded' },
        }),
        this.prisma.notificationLog.create({
          data: { orderId, kind: 'refund' },
        }),
      ];
      if (ticketVoidScope) {
        ops.push(
          this.prisma.ticket.updateMany({
            where: ticketVoidScope,
            data: { status: 'void' },
          }),
        );
      }
      await this.prisma.$transaction(ops);
      shouldSendRefundEmail = true;
    } catch (err) {
      const isUniqueViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!isUniqueViolation) throw err;
      this.logger.log({ orderId }, 'Refund email already sent for this order by another path');
      // Re-run the state flip without the log insert so the order still moves
      // to 'refunded' and its tickets still get voided in this code path.
      const ops: Prisma.PrismaPromise<unknown>[] = [
        this.prisma.order.update({
          where: { id: orderId },
          data: { status: 'refunded' },
        }),
      ];
      if (ticketVoidScope) {
        ops.push(
          this.prisma.ticket.updateMany({
            where: ticketVoidScope,
            data: { status: 'void' },
          }),
        );
      }
      await this.prisma.$transaction(ops);
    }
    this.logger.log({ orderId }, 'Order marked refunded');

    // record() swallows its own errors, so this can never fail the refund flip.
    await this.audit.record({
      organizationId: order.event.organizationId,
      actorUserId: null,
      action: 'refund_settled',
      resourceType: 'order',
      resourceId: orderId,
      metadata: {
        provider: order.provider ?? 'unknown',
        totalMinor: Number(order.totalMinor),
        currency: order.currency,
      },
    });

    if (!shouldSendRefundEmail) return;
    if (!order.registration?.user?.email) return;

    const refundedAtLine = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: order.event.timezone,
    }).format(new Date());
    await this.notifications
      .sendRefundEmail(order.registration.user.email, {
        orderId: order.id,
        eventTitle: order.event.title,
        orgName: order.event.organization.name,
        refundedAtLine,
        provider: order.provider ?? 'unknown',
        totalFormatted: formatMoney(order.totalMinor, order.currency),
      })
      .catch((err) => this.logger.warn({ err, orderId }, 'Failed to send refund email'));
  }

  /**
   * Cron-driven cleanup. Releases pending orders older than `ORDER_HOLD_TTL_MIN`
   * so the tier inventory becomes available again. Critically, before failing an
   * order the buyer started paying for (has a providerRef) we verify it against
   * the provider, so a paid-but-unsettled order (missed webhook AND missed
   * return) is recovered rather than wrongly cancelled.
   */
  async releaseStaleHolds(): Promise<{ released: number; recovered: number }> {
    const ttl = Number(this.cfg.get<number>('ORDER_HOLD_TTL_MIN') ?? 20);
    const cutoff = new Date(Date.now() - ttl * 60_000);
    const stale = await this.prisma.order.findMany({
      where: { status: 'pending', createdAt: { lt: cutoff } },
      select: { id: true, provider: true, providerRef: true },
      take: 50,
    });
    let released = 0;
    let recovered = 0;
    for (const o of stale) {
      try {
        if (o.provider && o.providerRef) {
          const { status } = await this.settleOrder(o.id);
          if (status === 'paid') {
            recovered += 1;
            this.logger.warn(
              { orderId: o.id },
              'Stale order was actually paid; recovered instead of releasing',
            );
            continue;
          }
        }
        await this.markOrderFailed(o.id, 'expired');
        released += 1;
      } catch (err) {
        this.logger.warn({ err, orderId: o.id }, 'Could not release stale order');
      }
    }
    if (released > 0 || recovered > 0) {
      this.logger.log({ released, recovered }, 'Stale-hold sweep complete');
    }
    return { released, recovered };
  }

  /**
   * Reconciliation sweep. Finds pending orders the buyer started paying for
   * (has a providerRef) within the recent window and re-checks them against the
   * provider, settling any that actually succeeded but whose webhook AND
   * verify-on-return were both missed. Recovered/failed counts are logged so a
   * monitor can alert on drift. Idempotent (settleOrder no-ops a settled order)
   * and safe to run on a schedule, ahead of the TTL release so paid customers
   * are settled promptly rather than only when their hold expires.
   */
  async reconcilePendingPayments(opts?: {
    windowMinutes?: number;
    batch?: number;
  }): Promise<{ checked: number; recoveredPaid: number; markedFailed: number; stillPending: number }> {
    const windowMinutes = opts?.windowMinutes ?? 60 * 24 * 3; // last 3 days
    const batch = opts?.batch ?? 100;
    const now = Date.now();
    const candidates = await this.prisma.order.findMany({
      where: {
        status: 'pending',
        provider: { not: null },
        providerRef: { not: null },
        createdAt: { lt: new Date(now - 60_000), gt: new Date(now - windowMinutes * 60_000) },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: batch,
    });

    let recoveredPaid = 0;
    let markedFailed = 0;
    let stillPending = 0;
    for (const o of candidates) {
      try {
        const { status } = await this.settleOrder(o.id);
        if (status === 'paid') {
          recoveredPaid += 1;
          this.logger.warn(
            { orderId: o.id },
            'Reconciliation recovered a paid order (webhook and return both missed)',
          );
        } else if (status === 'failed') {
          markedFailed += 1;
        } else {
          stillPending += 1;
        }
      } catch (err) {
        stillPending += 1;
        this.logger.warn({ err, orderId: o.id }, 'Reconciliation check failed for order');
      }
    }

    const summary = { checked: candidates.length, recoveredPaid, markedFailed, stillPending };
    if (recoveredPaid > 0 || markedFailed > 0) {
      this.logger.warn(summary, 'Payment reconciliation drift detected');
    } else if (candidates.length > 0) {
      this.logger.log(summary, 'Payment reconciliation clean');
    }
    return summary;
  }

  /**
   * Refund reconciliation sweep, the mirror of `reconcilePendingPayments` for
   * the refund side. Finds orders still `paid` that have a refund in flight
   * (`refundInitiatedAt` set) within the recent window and asks the provider
   * whether the refund has settled, flipping any confirmed ones to `refunded`.
   * This closes the gap where a refund's synchronous result was `pending` (slow
   * bank refund) AND its `charge.refunded`/`refund.processed` webhook was
   * missed. A provider that reports the refund `failed` clears the in-flight
   * marker and audits it, so it stops being rescanned and the failure surfaces.
   * Idempotent (markOrderRefunded no-ops a settled order); safe on a schedule.
   * Window defaults to 7 days because bank-backed refunds can take several days.
   */
  async reconcileRefunds(opts?: {
    windowMinutes?: number;
    batch?: number;
  }): Promise<{ checked: number; settled: number; failed: number; stillPending: number }> {
    const windowMinutes = opts?.windowMinutes ?? 60 * 24 * 7; // last 7 days
    const batch = opts?.batch ?? 100;
    const windowStart = new Date(Date.now() - windowMinutes * 60_000);
    const candidates = await this.prisma.order.findMany({
      where: {
        status: 'paid',
        refundInitiatedAt: { not: null, gt: windowStart },
        provider: { not: null },
        providerRef: { not: null },
      },
      select: { id: true, provider: true, providerRef: true },
      orderBy: { refundInitiatedAt: 'asc' },
      take: batch,
    });

    let settled = 0;
    let failed = 0;
    let stillPending = 0;
    for (const o of candidates) {
      try {
        const provider = this.registry.resolve(o.provider as PaymentMethodName);
        if (!provider.verifyRefund || !o.providerRef) {
          stillPending += 1;
          continue;
        }
        const { status } = await provider.verifyRefund({ providerRef: o.providerRef });
        if (status === 'succeeded') {
          await this.markOrderRefunded(o.id);
          settled += 1;
          this.logger.warn(
            { orderId: o.id },
            'Reconciliation settled a refund (webhook and sync result both missed)',
          );
        } else if (status === 'failed') {
          await this.clearFailedRefund(o.id);
          failed += 1;
        } else {
          stillPending += 1;
        }
      } catch (err) {
        stillPending += 1;
        this.logger.warn({ err, orderId: o.id }, 'Refund reconciliation check failed for order');
      }
    }

    const summary = { checked: candidates.length, settled, failed, stillPending };
    if (settled > 0 || failed > 0) {
      this.logger.warn(summary, 'Refund reconciliation drift detected');
    } else if (candidates.length > 0) {
      this.logger.log(summary, 'Refund reconciliation clean');
    }
    return summary;
  }

  /**
   * A refund the provider ultimately declined: clear the in-flight marker so it
   * stops being rescanned, leave the order `paid`, and audit the failure so an
   * operator can re-attempt or investigate.
   */
  private async clearFailedRefund(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { event: { select: { organizationId: true } } },
    });
    if (!order || order.refundInitiatedAt === null) return;
    await this.prisma.order.update({
      where: { id: orderId },
      data: { refundInitiatedAt: null },
    });
    this.logger.warn({ orderId }, 'Refund reported failed by provider; cleared in-flight marker');
    await this.audit.record({
      organizationId: order.event.organizationId,
      actorUserId: null,
      action: 'refund_failed',
      resourceType: 'order',
      resourceId: orderId,
      metadata: { provider: order.provider ?? 'unknown', reason: 'provider reported failed' },
    });
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
