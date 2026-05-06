import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Org-wide overview: totals across all events the org owns. Used by the
   * top tiles on the dashboard. Numbers are computed live; they're cheap
   * because the underlying queries hit indexed columns. If we need to scale
   * to very large orgs we'll pre-aggregate into a roll-up table on a cron.
   */
  async overview(orgId: string) {
    const [eventsCount, registrationsCount, paidOrders, checkedIn, upcoming] =
      await Promise.all([
        this.prisma.event.count({ where: { organizationId: orgId } }),
        this.prisma.registration.count({ where: { event: { organizationId: orgId } } }),
        this.prisma.order.findMany({
          where: { event: { organizationId: orgId }, status: 'paid' },
          select: { totalMinor: true, currency: true },
        }),
        this.prisma.ticket.count({
          where: {
            registration: { event: { organizationId: orgId } },
            status: 'checked_in',
          },
        }),
        this.prisma.event.count({
          where: {
            organizationId: orgId,
            startAt: { gt: new Date() },
            status: { in: ['published', 'live'] },
          },
        }),
      ]);

    // Aggregate revenue by currency. Most orgs operate in one currency, but
    // the schema allows mixed, so we surface totals per currency rather
    // than a single "Revenue" number. The dashboard uses the most recent.
    const revenueByCurrency: Record<string, number> = {};
    for (const o of paidOrders) {
      revenueByCurrency[o.currency] = (revenueByCurrency[o.currency] ?? 0) + Number(o.totalMinor);
    }

    // Recent registrations across all org events for the dashboard table.
    const recentRows = await this.prisma.registration.findMany({
      where: { event: { organizationId: orgId } },
      include: {
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        event: { select: { id: true, title: true, code: true } },
        tickets: {
          select: { tier: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    // 6-month registration timeline for the attendance chart.
    const since = new Date();
    since.setMonth(since.getMonth() - 5, 1);
    since.setHours(0, 0, 0, 0);
    const monthly = await this.prisma.$queryRawUnsafe<
      Array<{ bucket: Date; count: bigint }>
    >(
      `select date_trunc('month', r.created_at) as bucket, count(*)::bigint as count
       from registrations r
       join events e on e.id = r.event_id
       where e.organization_id = $1::uuid and r.created_at >= $2::timestamptz
       group by 1
       order by 1 asc`,
      orgId,
      since.toISOString(),
    );

    // Top events by registrations (for the "Most engaged" tile).
    const topEventsRaw = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; title: string; code: string; reg_count: bigint }>
    >(
      `select e.id, e.title, e.code, count(r.id)::bigint as reg_count
       from events e
       left join registrations r on r.event_id = e.id
       where e.organization_id = $1::uuid
       group by e.id, e.title, e.code
       order by reg_count desc
       limit 4`,
      orgId,
    );

    return {
      eventsCount,
      upcomingEventsCount: upcoming,
      registrationsCount,
      paidOrdersCount: paidOrders.length,
      checkedInCount: checkedIn,
      revenueByCurrency,
      recentRegistrations: recentRows.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        tier: r.tickets[0]?.tier.name ?? null,
        user: r.user,
        event: r.event,
      })),
      monthlyRegistrations: monthly.map((m) => ({
        month: m.bucket.toISOString().slice(0, 7),
        count: Number(m.count),
      })),
      topEvents: topEventsRaw.map((e) => ({
        id: e.id,
        title: e.title,
        code: e.code,
        registrations: Number(e.reg_count),
      })),
    };
  }


  /**
   * Marketing-shaped org-wide rollup. Powers `/dashboard/analytics`. Combines
   * the overview metrics with a longer 12-month trend, a per-event revenue
   * breakdown, a registrations -> paid conversion funnel, and check-in rate.
   * All queries hit indexed columns; the per-event roll-up uses a single
   * aggregate query so we don't N+1 across events.
   */
  async rollup(orgId: string) {
    const [
      eventsCount,
      registrationsTotal,
      paidOrders,
      ticketsIssued,
      checkedIn,
      pendingOrders,
      messagesCount,
    ] = await Promise.all([
      this.prisma.event.count({ where: { organizationId: orgId } }),
      this.prisma.registration.count({ where: { event: { organizationId: orgId } } }),
      this.prisma.order.findMany({
        where: { event: { organizationId: orgId }, status: 'paid' },
        select: { totalMinor: true, currency: true, eventId: true, paidAt: true },
      }),
      this.prisma.ticket.count({
        where: {
          registration: { event: { organizationId: orgId } },
          status: { in: ['issued', 'checked_in'] },
        },
      }),
      this.prisma.ticket.count({
        where: { registration: { event: { organizationId: orgId } }, status: 'checked_in' },
      }),
      this.prisma.order.count({
        where: { event: { organizationId: orgId }, status: 'pending' },
      }),
      this.prisma.message.count({
        where: { channel: { event: { organizationId: orgId } }, deletedAt: null },
      }),
    ]);

    const revenueByCurrency: Record<string, number> = {};
    for (const o of paidOrders) {
      revenueByCurrency[o.currency] = (revenueByCurrency[o.currency] ?? 0) + Number(o.totalMinor);
    }

    // 12-month registration + revenue timeline.
    const since = new Date();
    since.setMonth(since.getMonth() - 11, 1);
    since.setHours(0, 0, 0, 0);
    const monthly = await this.prisma.$queryRawUnsafe<
      Array<{ bucket: Date; registrations: bigint; paid_orders: bigint; revenue_minor: bigint }>
    >(
      `select date_trunc('month', r.created_at) as bucket,
              count(distinct r.id)::bigint as registrations,
              count(distinct o.id) filter (where o.status = 'paid')::bigint as paid_orders,
              coalesce(sum(o.total_minor) filter (where o.status = 'paid'), 0)::bigint as revenue_minor
       from registrations r
       join events e on e.id = r.event_id
       left join orders o on o.event_id = r.event_id
                          and o.user_id = r.user_id
                          and date_trunc('month', o.created_at) = date_trunc('month', r.created_at)
       where e.organization_id = $1::uuid and r.created_at >= $2::timestamptz
       group by 1
       order by 1 asc`,
      orgId,
      since.toISOString(),
    );

    // Per-event roll-up for the breakdown table.
    const perEventRaw = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        title: string;
        code: string;
        status: string;
        start_at: Date;
        registrations: bigint;
        paid_orders: bigint;
        revenue_minor: bigint;
        currency: string | null;
        checked_in: bigint;
      }>
    >(
      `select e.id, e.title, e.code, e.status, e.start_at,
              count(distinct r.id)::bigint as registrations,
              count(distinct o.id) filter (where o.status = 'paid')::bigint as paid_orders,
              coalesce(sum(o.total_minor) filter (where o.status = 'paid'), 0)::bigint as revenue_minor,
              max(o.currency) as currency,
              count(distinct t.id) filter (where t.status = 'checked_in')::bigint as checked_in
       from events e
       left join registrations r on r.event_id = e.id
       left join orders o on o.event_id = e.id
       left join tickets t on t.registration_id = r.id
       where e.organization_id = $1::uuid
       group by e.id, e.title, e.code, e.status, e.start_at
       order by e.start_at desc nulls last
       limit 50`,
      orgId,
    );

    return {
      totals: {
        eventsCount,
        registrationsTotal,
        paidOrdersCount: paidOrders.length,
        pendingOrdersCount: pendingOrders,
        ticketsIssued,
        checkedIn,
        messagesCount,
        revenueByCurrency,
      },
      funnel: {
        registrations: registrationsTotal,
        paidOrders: paidOrders.length,
        ticketsIssued,
        checkedIn,
      },
      monthly: monthly.map((m) => ({
        month: m.bucket.toISOString().slice(0, 7),
        registrations: Number(m.registrations),
        paidOrders: Number(m.paid_orders),
        revenueMinor: Number(m.revenue_minor),
      })),
      events: perEventRaw.map((e) => ({
        id: e.id,
        title: e.title,
        code: e.code,
        status: e.status,
        startAt: e.start_at?.toISOString() ?? null,
        registrations: Number(e.registrations),
        paidOrders: Number(e.paid_orders),
        revenueMinor: Number(e.revenue_minor),
        currency: e.currency,
        checkedIn: Number(e.checked_in),
      })),
    };
  }

  /**
   * Per-event detail used on the event analytics tab. Splits by tier,
   * shows day-by-day registration counts, and pulls poll engagement.
   */
  async eventOverview(orgId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId },
      select: { id: true, title: true, code: true, startAt: true, endAt: true, capacity: true },
    });
    if (!event) return null;

    const [tiers, registrations, paid, checkedIn, messageCount, pollVotes, dailyRows] =
      await Promise.all([
        this.prisma.ticketTier.findMany({
          where: { eventId },
          select: {
            id: true,
            name: true,
            quantitySold: true,
            quantityTotal: true,
            priceMinor: true,
            currency: true,
          },
          orderBy: { position: 'asc' },
        }),
        this.prisma.registration.count({ where: { eventId } }),
        this.prisma.order.findMany({
          where: { eventId, status: 'paid' },
          select: { totalMinor: true, currency: true },
        }),
        this.prisma.ticket.count({
          where: { registration: { eventId }, status: 'checked_in' },
        }),
        this.prisma.message.count({
          where: { channel: { eventId }, deletedAt: null },
        }),
        this.prisma.pollVote.count({
          where: { poll: { session: { eventId } } },
        }),
        this.prisma.$queryRawUnsafe<Array<{ day: Date; count: bigint }>>(
          `select date_trunc('day', created_at) as day, count(*)::bigint as count
           from registrations
           where event_id = $1::uuid
           group by 1
           order by 1 asc`,
          eventId,
        ),
      ]);

    const revenueByCurrency: Record<string, number> = {};
    for (const o of paid) {
      revenueByCurrency[o.currency] = (revenueByCurrency[o.currency] ?? 0) + Number(o.totalMinor);
    }

    const ticketsSold = tiers.reduce((s, t) => s + (t.quantitySold ?? 0), 0);
    const ticketsCapacity = tiers.reduce((s, t) => s + (t.quantityTotal ?? 0), 0);

    return {
      event,
      registrations,
      ticketsSold,
      ticketsCapacity,
      checkedIn,
      revenueByCurrency,
      messageCount,
      pollVotes,
      tiers: tiers.map((t) => ({
        id: t.id,
        name: t.name,
        sold: t.quantitySold,
        total: t.quantityTotal,
        priceMinor: Number(t.priceMinor),
        currency: t.currency,
      })),
      dailyRegistrations: dailyRows.map((r) => ({
        day: r.day.toISOString().slice(0, 10),
        count: Number(r.count),
      })),
    };
  }
}
