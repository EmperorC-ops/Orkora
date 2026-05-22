import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  RegisterAttendeesDto,
  type PaymentMethod,
  PAYMENT_METHODS,
} from './dto/registration.dto';
import { TicketSigner } from './ticket-signer';

const TICKET_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TICKET_CODE_LENGTH = 10;

/**
 * Generate a human-friendly, collision-resistant ticket code from a
 * crypto-random source. Uses an unambiguous alphabet (no 0/O/1/I/L) so the
 * code is safe to read aloud at a check-in desk.
 */
function generateTicketCode(): string {
  const bytes = randomBytes(TICKET_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < TICKET_CODE_LENGTH; i++) {
    out += TICKET_CODE_ALPHABET.charAt((bytes[i] ?? 0) % TICKET_CODE_ALPHABET.length);
  }
  return out;
}

/**
 * Format an event's start/end as a single human line for emails, rendered in
 * the event's own timezone (e.g. "Sat, 20 Jun 2026, 18:00 - 22:00"). Falls
 * back to a day range when the event spans multiple calendar days.
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

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly signer: TicketSigner,
  ) {}

  /**
   * Public registration entry point. Creates (or reuses) a user by email,
   * reserves seats with row locking, issues tickets for free tiers, or opens
   * a pending order for paid tiers.
   */
  async register(eventCode: string, dto: RegisterAttendeesDto) {
    const event = await this.prisma.event.findUnique({ where: { code: eventCode } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.status !== 'published') {
      throw new BadRequestException('Event is not open for registration');
    }
    if (event.endAt <= new Date()) {
      throw new BadRequestException('Event has already ended');
    }

    const tier = await this.prisma.ticketTier.findUnique({ where: { id: dto.tierId } });
    if (!tier || tier.eventId !== event.id) {
      throw new NotFoundException('Ticket tier not found for this event');
    }

    const now = new Date();
    if (tier.saleStartsAt && tier.saleStartsAt > now) {
      throw new BadRequestException('Ticket sales have not started yet');
    }
    if (tier.saleEndsAt && tier.saleEndsAt < now) {
      throw new BadRequestException('Ticket sales have ended');
    }

    const qty = dto.attendees.length;
    if (qty < tier.minPerOrder) {
      throw new BadRequestException(
        `This tier requires at least ${tier.minPerOrder} attendees per order`,
      );
    }
    if (qty > tier.maxPerOrder) {
      throw new BadRequestException(
        `This tier allows at most ${tier.maxPerOrder} attendees per order`,
      );
    }

    const isFree = Number(tier.priceMinor) === 0;
    const requestedMethod: PaymentMethod =
      dto.paymentMethod ?? (isFree ? 'free' : 'stripe');
    if (isFree && requestedMethod !== 'free') {
      throw new BadRequestException('This tier is free; do not specify a payment method');
    }
    if (!isFree && requestedMethod === 'free') {
      throw new BadRequestException('This tier requires payment');
    }
    if (!PAYMENT_METHODS.includes(requestedMethod)) {
      throw new BadRequestException('Invalid payment method');
    }

    // The lead attendee owns the registration on the user side.
    const lead = dto.attendees[0];
    if (!lead) throw new BadRequestException('At least one attendee is required');

    const user = await this.upsertUserByEmail(lead.email, lead.fullName, lead.phone);

    // Race-safe: lock the tier row and re-check inventory inside the
    // transaction. Postgres FOR UPDATE serializes concurrent registrants for
    // the same tier without falling back to advisory locks or retry loops.
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<
        Array<{ quantity_total: number | null; quantity_sold: number }>
      >(
        'select quantity_total, quantity_sold from ticket_tiers where id = $1::uuid for update',
        tier.id,
      );
      const row = locked[0];
      if (!row) throw new NotFoundException('Ticket tier not found');
      const remaining = row.quantity_total === null ? Infinity : row.quantity_total - row.quantity_sold;
      if (qty > remaining) {
        throw new ConflictException('Not enough tickets remaining in this tier');
      }

      // One registration per (event, user). If the user already has one, we
      // reuse it and append tickets, which is consistent with the unique
      // constraint in the schema.
      const registration = await tx.registration.upsert({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
        create: {
          eventId: event.id,
          userId: user.id,
          status: isFree ? 'confirmed' : 'pending',
          formResponses: (dto.formResponses ?? {}) as Prisma.InputJsonValue,
        },
        update: {
          status: isFree ? 'confirmed' : 'pending',
          formResponses: (dto.formResponses ?? {}) as Prisma.InputJsonValue,
        },
      });

      // Bump the sold count atomically.
      await tx.ticketTier.update({
        where: { id: tier.id },
        data: { quantitySold: { increment: qty } },
      });

      // Issue ticket rows. For a free tier they are immediately 'issued'. For
      // a paid tier we still create them as 'pending' so they exist in state
      // and can be flipped on payment success.
      const tickets = await Promise.all(
        dto.attendees.map((a) =>
          tx.ticket.create({
            data: {
              registrationId: registration.id,
              tierId: tier.id,
              code: generateTicketCode(),
              holderName: a.fullName.trim(),
              holderEmail: a.email.trim().toLowerCase(),
              status: isFree ? 'issued' : 'pending',
            },
          }),
        ),
      );

      let order: Awaited<ReturnType<typeof tx.order.create>> | null = null;
      let checkoutUrl: string | null = null;
      if (!isFree) {
        const subtotal = BigInt(tier.priceMinor) * BigInt(qty);
        order = await tx.order.create({
          data: {
            eventId: event.id,
            userId: user.id,
            registrationId: registration.id,
            subtotalMinor: subtotal,
            feesMinor: BigInt(0),
            totalMinor: subtotal,
            currency: tier.currency,
            status: 'pending',
            provider: requestedMethod,
            items: {
              create: [
                {
                  tierId: tier.id,
                  quantity: qty,
                  unitPriceMinor: tier.priceMinor,
                },
              ],
            },
          },
          include: { items: true },
        });
        // The actual hosted-checkout URL is wired in Slice 3.2 (payments
        // module). Until then, the front end shows a "Payment provider not
        // yet wired" state when paymentMethod is non-free.
        checkoutUrl = null;
      }

      // Confirmation email for free tier. For paid tier, send after payment
      // success in 3.2.
      if (isFree) {
        const appUrl = this.cfg.get<string>('APP_URL') ?? 'http://localhost:3000';
        await this.notifications
          .sendTicketConfirmationEmail(user.email, {
            eventTitle: event.title,
            eventDateLine: formatDateRange(event.startAt, event.endAt, event.timezone),
            tickets: tickets.map((t) => ({
              code: t.code,
              holderName: t.holderName,
              tierName: tier.name,
              ticketUrl: `${appUrl}/t/${t.code}`,
            })),
          })
          .catch((err) => {
            // We do not fail the registration on email send failure. Logging
            // happens in the email provider.
            return err;
          });
      }

      return {
        registrationId: registration.id,
        status: registration.status,
        userId: user.id,
        eventId: event.id,
        eventCode: event.code,
        tickets: tickets.map((t) => this.shapeTicket(t, tier.name, event.id)),
        order: order
          ? {
              id: order.id,
              status: order.status,
              currency: order.currency,
              totalMinor: Number(order.totalMinor),
              provider: order.provider,
              checkoutUrl,
            }
          : null,
      };
    });
  }

  async getTicketByCode(code: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { code },
      include: { tier: true, registration: { include: { event: true } } },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.publicTicket(ticket);
  }

  async listMyTickets(userId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { registration: { userId } },
      include: { tier: true, registration: { include: { event: true } } },
      orderBy: { issuedAt: 'desc' },
    });
    return tickets.map((t) => this.publicTicket(t));
  }

  /**
   * Verify a scanned QR token and mark the ticket as checked-in. Idempotent
   * if already checked-in: returns the existing record without changing it.
   *
   * Tenancy: the caller must be a member of the event's org with at least
   * `staff` role. The controller enforces that with `RolesGuard`. We
   * additionally check the token's eventId matches the requested event so
   * a stolen scanner cannot check in tickets from other events.
   */
  async checkIn(orgId: string, eventId: string, qrToken: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId },
      select: { id: true, title: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const payload = this.signer.verify(qrToken);
    if (!payload) {
      throw new BadRequestException('Invalid or expired ticket code');
    }
    if (payload.e !== event.id) {
      throw new BadRequestException('Ticket does not belong to this event');
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: payload.t },
      include: {
        tier: true,
        registration: { include: { event: { select: { id: true } } } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.registration.event.id !== event.id) {
      throw new BadRequestException('Ticket does not belong to this event');
    }
    if (ticket.status === 'cancelled') {
      throw new BadRequestException('Ticket is cancelled');
    }
    if (ticket.status === 'pending') {
      throw new BadRequestException('Ticket is not yet paid for');
    }

    if (ticket.checkedInAt) {
      return {
        id: ticket.id,
        code: ticket.code,
        holderName: ticket.holderName,
        tier: ticket.tier.name,
        status: ticket.status,
        checkedInAt: ticket.checkedInAt,
        alreadyCheckedIn: true,
      };
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'checked_in', checkedInAt: new Date() },
      include: { tier: true },
    });
    return {
      id: updated.id,
      code: updated.code,
      holderName: updated.holderName,
      tier: updated.tier.name,
      status: updated.status,
      checkedInAt: updated.checkedInAt,
      alreadyCheckedIn: false,
    };
  }

  async getCheckinStats(orgId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    const [issued, checkedIn] = await Promise.all([
      this.prisma.ticket.count({
        where: { registration: { eventId }, status: { in: ['issued', 'checked_in'] } },
      }),
      this.prisma.ticket.count({
        where: { registration: { eventId }, status: 'checked_in' },
      }),
    ]);
    return { issued, checkedIn };
  }

  /**
   * Org-wide registrations list. Identical shape to listForOrgEvent but
   * spans every event the org owns. Filters: status, q (name/email),
   * eventId. Pagination via take/skip; capped at 200 per page.
   */
  async listForOrg(
    orgId: string,
    query: { status?: string; q?: string; eventId?: string; take?: number; skip?: number },
  ) {
    const take = Math.min(Math.max(query.take ?? 100, 1), 200);
    const skip = Math.max(query.skip ?? 0, 0);

    const where: Prisma.RegistrationWhereInput = {
      event: { organizationId: orgId },
    };
    if (query.eventId) where.eventId = query.eventId;
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { user: { email: { contains: query.q, mode: 'insensitive' } } },
        { user: { fullName: { contains: query.q, mode: 'insensitive' } } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.registration.findMany({
        where,
        include: {
          user: true,
          tickets: { include: { tier: true } },
          event: { select: { id: true, title: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.registration.count({ where }),
    ]);

    return {
      total,
      take,
      skip,
      rows: rows.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        user: {
          id: r.user.id,
          fullName: r.user.fullName,
          email: r.user.email,
          avatarUrl: r.user.avatarUrl,
        },
        event: r.event,
        tickets: r.tickets.map((t) => ({
          id: t.id,
          code: t.code,
          holderName: t.holderName,
          holderEmail: t.holderEmail,
          status: t.status,
          tier: { id: t.tierId, name: t.tier.name },
        })),
      })),
    };
  }

  /**
   * Unique attendee rollup across an org. Groups registrations by user,
   * computes events attended, ticket counts, and total spent (paid orders only).
   * Capped at 500 per page; UI paginates.
   */
  async attendeesForOrg(
    orgId: string,
    query: { q?: string; sort?: 'name' | 'events' | 'spent'; take?: number; skip?: number },
  ) {
    const take = Math.min(Math.max(query.take ?? 100, 1), 500);
    const skip = Math.max(query.skip ?? 0, 0);
    const sort = query.sort ?? 'events';

    const orderBy =
      sort === 'name'
        ? `lower(u.full_name) asc`
        : sort === 'spent'
          ? `total_spent_minor desc`
          : `events_attended desc`;

    const search = query.q ? `%${query.q.toLowerCase()}%` : null;

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        user_id: string;
        full_name: string;
        email: string;
        avatar_url: string | null;
        events_attended: bigint;
        ticket_count: bigint;
        total_spent_minor: bigint;
        primary_currency: string | null;
        last_registered_at: Date;
      }>
    >(
      `with attendee_events as (
         select r.user_id, r.event_id
         from registrations r
         join events e on e.id = r.event_id
         where e.organization_id = $1::uuid
         group by r.user_id, r.event_id
       ),
       attendee_orders as (
         select o.user_id, o.event_id, o.total_minor, o.currency
         from orders o
         join events e on e.id = o.event_id
         where e.organization_id = $1::uuid and o.status = 'paid'
       ),
       attendee_tickets as (
         select r.user_id, count(t.id) as ticket_count
         from registrations r
         join events e on e.id = r.event_id
         left join tickets t on t.registration_id = r.id
         where e.organization_id = $1::uuid
         group by r.user_id
       )
       select u.id as user_id,
              u.full_name,
              u.email,
              u.avatar_url,
              count(distinct ae.event_id)::bigint as events_attended,
              coalesce(at.ticket_count, 0)::bigint as ticket_count,
              coalesce(sum(ao.total_minor), 0)::bigint as total_spent_minor,
              (select currency from attendee_orders ao2
                 where ao2.user_id = u.id
                 group by currency
                 order by sum(total_minor) desc
                 limit 1) as primary_currency,
              max(r.created_at) as last_registered_at
       from users u
       join registrations r on r.user_id = u.id
       join events e on e.id = r.event_id and e.organization_id = $1::uuid
       left join attendee_events ae on ae.user_id = u.id
       left join attendee_orders ao on ao.user_id = u.id
       left join attendee_tickets at on at.user_id = u.id
       where ($2::text is null
              or lower(u.full_name) like $2
              or lower(u.email) like $2)
       group by u.id, u.full_name, u.email, u.avatar_url, at.ticket_count
       order by ${orderBy}
       limit $3 offset $4`,
      orgId,
      search,
      take,
      skip,
    );

    const totalRow = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `select count(distinct u.id)::bigint as count
       from users u
       join registrations r on r.user_id = u.id
       join events e on e.id = r.event_id and e.organization_id = $1::uuid
       where ($2::text is null
              or lower(u.full_name) like $2
              or lower(u.email) like $2)`,
      orgId,
      search,
    );

    return {
      total: Number(totalRow[0]?.count ?? 0),
      take,
      skip,
      rows: rows.map((r) => ({
        userId: r.user_id,
        fullName: r.full_name,
        email: r.email,
        avatarUrl: r.avatar_url,
        eventsAttended: Number(r.events_attended),
        ticketCount: Number(r.ticket_count),
        totalSpentMinor: Number(r.total_spent_minor),
        primaryCurrency: r.primary_currency,
        lastRegisteredAt: r.last_registered_at?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Attendee detail for the org-wide drilldown. Returns the user record plus
   * every registration (with event + tier) they have inside this org.
   */
  async attendeeDetailForOrg(orgId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const registrations = await this.prisma.registration.findMany({
      where: { userId, event: { organizationId: orgId } },
      include: {
        event: { select: { id: true, title: true, code: true, startAt: true } },
        tickets: { include: { tier: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (registrations.length === 0) {
      // Tenancy: this user has nothing in this org. Don't leak that they exist
      // somewhere else — fail the same way as a non-existent user.
      throw new NotFoundException('User not found');
    }

    const orders = await this.prisma.order.findMany({
      where: { userId, event: { organizationId: orgId } },
      select: {
        id: true,
        status: true,
        currency: true,
        totalMinor: true,
        provider: true,
        createdAt: true,
        paidAt: true,
        eventId: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalSpentByCurrency: Record<string, number> = {};
    for (const o of orders.filter((x) => x.status === 'paid')) {
      totalSpentByCurrency[o.currency] =
        (totalSpentByCurrency[o.currency] ?? 0) + Number(o.totalMinor);
    }

    return {
      user,
      stats: {
        eventsAttended: new Set(registrations.map((r) => r.eventId)).size,
        ticketCount: registrations.reduce((s, r) => s + r.tickets.length, 0),
        totalSpentByCurrency,
      },
      registrations: registrations.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        event: {
          ...r.event,
          startAt: r.event.startAt?.toISOString() ?? null,
        },
        tickets: r.tickets.map((t) => ({
          id: t.id,
          code: t.code,
          status: t.status,
          tier: t.tier.name,
        })),
      })),
      orders: orders.map((o) => ({
        ...o,
        totalMinor: Number(o.totalMinor),
        createdAt: o.createdAt.toISOString(),
        paidAt: o.paidAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Per-event registrations list. Powers the per-event registrations page.
   */
  async listForOrgEvent(orgId: string, eventId: string, query: { status?: string; q?: string }) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const where: Prisma.RegistrationWhereInput = { eventId };
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { user: { email: { contains: query.q, mode: 'insensitive' } } },
        { user: { fullName: { contains: query.q, mode: 'insensitive' } } },
      ];
    }

    const rows = await this.prisma.registration.findMany({
      where,
      include: {
        user: true,
        tickets: { include: { tier: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      user: {
        id: r.user.id,
        fullName: r.user.fullName,
        email: r.user.email,
        avatarUrl: r.user.avatarUrl,
      },
      tickets: r.tickets.map((t) => ({
        id: t.id,
        code: t.code,
        holderName: t.holderName,
        holderEmail: t.holderEmail,
        status: t.status,
        tier: { id: t.tierId, name: t.tier.name },
      })),
    }));
  }

  // --- helpers ---

  /**
   * Upsert by email. New users come from anonymous registrations; existing
   * users keep their account, with a light backfill of the phone field if
   * absent. We never overwrite an existing fullName.
   */
  private async upsertUserByEmail(email: string, fullName: string, phone?: string) {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      if (!existing.phone && phone) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { phone },
        });
      }
      return existing;
    }
    return this.prisma.user.create({
      data: {
        email: normalized,
        fullName: fullName.trim(),
        phone,
        emailVerified: false,
        locale: 'en-NG',
      },
    });
  }

  /**
   * Shape a freshly issued ticket for the registration response. Wraps the
   * QR token so the mobile app can render the code immediately.
   */
  private shapeTicket(
    ticket: { id: string; code: string; holderName: string; holderEmail: string; status: string },
    tierName: string,
    eventId: string,
  ) {
    const qrToken = this.signer.sign({ t: ticket.id, e: eventId });
    return {
      id: ticket.id,
      code: ticket.code,
      holderName: ticket.holderName,
      holderEmail: ticket.holderEmail,
      status: ticket.status,
      tierName,
      qrToken,
    };
  }

  /**
   * Map a persisted ticket (with `tier` and `registration.event` included) to
   * the public-facing shape consumed by the ticket page and the "my tickets"
   * list. Includes a fresh QR token and the event timezone so the client can
   * render times in the event's local zone.
   */
  private publicTicket(ticket: {
    id: string;
    code: string;
    holderName: string;
    holderEmail: string;
    status: string;
    issuedAt: Date;
    checkedInAt: Date | null;
    tier: { id: string; name: string };
    registration: {
      id: string;
      event: {
        id: string;
        title: string;
        code: string;
        startAt: Date;
        endAt: Date;
        bannerUrl: string | null;
        timezone: string;
      };
    };
  }) {
    const event = ticket.registration.event;
    return {
      id: ticket.id,
      code: ticket.code,
      holderName: ticket.holderName,
      holderEmail: ticket.holderEmail,
      status: ticket.status,
      issuedAt: ticket.issuedAt.toISOString(),
      checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
      tier: { id: ticket.tier.id, name: ticket.tier.name },
      event: {
        id: event.id,
        title: event.title,
        code: event.code,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt.toISOString(),
        bannerUrl: event.bannerUrl,
        timezone: event.timezone,
      },
      registrationId: ticket.registration.id,
      qrToken: this.signer.sign({ t: ticket.id, e: event.id }),
    };
  }
}
