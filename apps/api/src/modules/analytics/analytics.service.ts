import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  computeInsights,
  csvCell,
  sliceableFields,
  answersFor,
  matches,
  type GroupBy,
  type InsightField,
  type InsightFilters,
  type InsightRegistration,
} from './insights';

/** Upper bound on registrations loaded for one event's Insights. */
const INSIGHTS_MAX_ROWS = 10_000;
const REG_STATUSES = new Set(['confirmed', 'pending', 'cancelled']);
const UUID = /^[0-9a-f-]{36}$/i;

export interface InsightsQuery {
  from?: string;
  to?: string;
  tier?: string;
  status?: string;
  vip?: string;
  field?: string;
  value?: string;
  groupBy?: string;
}

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
      // Registrations and paid orders are aggregated separately and then
      // merged by month. Joining them row by row repeats an order once per
      // matching registration, which inflated revenue.
      `with reg as (
         select date_trunc('month', r.created_at) as bucket, count(*)::bigint as registrations
         from registrations r
         join events e on e.id = r.event_id
         where e.organization_id = $1::uuid and r.created_at >= $2::timestamptz
         group by 1
       ),
       ord as (
         select date_trunc('month', o.created_at) as bucket,
                count(*)::bigint as paid_orders,
                coalesce(sum(o.total_minor), 0)::bigint as revenue_minor
         from orders o
         join events e on e.id = o.event_id
         where e.organization_id = $1::uuid and o.status = 'paid' and o.created_at >= $2::timestamptz
         group by 1
       )
       select coalesce(reg.bucket, ord.bucket) as bucket,
              coalesce(reg.registrations, 0)::bigint as registrations,
              coalesce(ord.paid_orders, 0)::bigint as paid_orders,
              coalesce(ord.revenue_minor, 0)::bigint as revenue_minor
       from reg
       full outer join ord on ord.bucket = reg.bucket
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
      // Each figure is its own subquery. Joining registrations, orders and
      // tickets together multiplied every order by the event's ticket count,
      // so revenue was overstated for paid events.
      `select e.id, e.title, e.code, e.status, e.start_at,
              (select count(*) from registrations r where r.event_id = e.id)::bigint as registrations,
              (select count(*) from orders o
                 where o.event_id = e.id and o.status = 'paid')::bigint as paid_orders,
              (select coalesce(sum(o.total_minor), 0) from orders o
                 where o.event_id = e.id and o.status = 'paid')::bigint as revenue_minor,
              (select max(o.currency) from orders o
                 where o.event_id = e.id and o.status = 'paid') as currency,
              (select count(*) from tickets t
                 join registrations r on r.id = t.registration_id
                 where r.event_id = e.id and t.status = 'checked_in')::bigint as checked_in
       from events e
       where e.organization_id = $1::uuid
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
      select: {
        id: true,
        title: true,
        code: true,
        startAt: true,
        endAt: true,
        timezone: true,
        capacity: true,
      },
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
          where: { poll: { eventId } },
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

  // ------------------- Insights (per-event slicing) -------------------

  /** Validated filters from the query string; anything malformed is ignored. */
  private parseInsightsQuery(q: InsightsQuery, fields: InsightField[]) {
    const date = (v?: string) => {
      if (!v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const filters: InsightFilters = {
      from: date(q.from),
      to: date(q.to),
      tierId: q.tier && UUID.test(q.tier) ? q.tier : null,
      status: q.status && REG_STATUSES.has(q.status) ? q.status : null,
      vip: q.vip === 'yes' || q.vip === 'no' ? q.vip : null,
      fieldId: null,
      fieldValue: null,
    };
    const sliceable = sliceableFields(fields);
    if (q.field && sliceable.some((f) => f.id === q.field) && q.value) {
      filters.fieldId = q.field;
      filters.fieldValue = String(q.value).slice(0, 200);
    }
    let groupBy: GroupBy = 'tier';
    if (q.groupBy === 'status' || q.groupBy === 'vip' || q.groupBy === 'tier') groupBy = q.groupBy;
    else if (q.groupBy?.startsWith('field:') && sliceable.some((f) => `field:${f.id}` === q.groupBy)) {
      groupBy = q.groupBy as GroupBy;
    }
    const hourly =
      !!filters.from && !!filters.to && filters.to.getTime() - filters.from.getTime() <= 72 * 3600_000;
    return { filters, groupBy, hourly };
  }

  private async loadInsightData(orgId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId },
      select: {
        id: true,
        title: true,
        timezone: true,
        registrationFields: true,
        tiers: { select: { id: true, name: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!event) return null;
    const fields = (Array.isArray(event.registrationFields) ? event.registrationFields : []) as unknown as InsightField[];
    const rows = await this.prisma.registration.findMany({
      where: { eventId },
      take: INSIGHTS_MAX_ROWS,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        status: true,
        isVip: true,
        formResponses: true,
        user: { select: { fullName: true, email: true } },
        tickets: {
          select: { tierId: true, status: true, checkedInAt: true, holderName: true, tier: { select: { name: true } } },
        },
        orders: { where: { status: 'paid' }, select: { totalMinor: true, currency: true } },
      },
    });
    const registrations: Array<InsightRegistration & { name: string; email: string }> = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      status: r.status,
      isVip: r.isVip,
      formResponses: (r.formResponses ?? {}) as Record<string, unknown>,
      tickets: r.tickets.map((t) => ({
        tierId: t.tierId,
        tierName: t.tier?.name ?? 'Ticket',
        status: t.status,
        checkedInAt: t.checkedInAt,
      })),
      paid: r.orders.map((o) => ({ totalMinor: Number(o.totalMinor), currency: o.currency })),
      name: r.tickets[0]?.holderName || r.user?.fullName || '',
      email: r.user?.email ?? '',
    }));
    return { event, fields, registrations, truncated: rows.length >= INSIGHTS_MAX_ROWS };
  }

  /** Sliced summary for the Insights panel. */
  async eventInsights(orgId: string, eventId: string, q: InsightsQuery) {
    const data = await this.loadInsightData(orgId, eventId);
    if (!data) return null;
    const { filters, groupBy, hourly } = this.parseInsightsQuery(q, data.fields);
    const result = computeInsights({
      registrations: data.registrations,
      fields: data.fields,
      filters,
      groupBy,
      timeZone: data.event.timezone || 'Africa/Lagos',
      hourly,
    });
    return {
      ...result,
      timezone: data.event.timezone,
      truncated: data.truncated,
      // What the panel can slice by.
      dimensions: {
        tiers: data.event.tiers,
        statuses: Array.from(REG_STATUSES),
        fields: sliceableFields(data.fields).map((f) => ({
          id: f.id,
          label: f.label,
          options: f.type === 'checkbox' ? ['Yes', 'No'] : (f.options ?? []),
        })),
      },
    };
  }

  /** The filtered attendee list as CSV, one row per registration. */
  async eventInsightsCsv(orgId: string, eventId: string, q: InsightsQuery): Promise<{ filename: string; csv: string } | null> {
    const data = await this.loadInsightData(orgId, eventId);
    if (!data) return null;
    const { filters } = this.parseInsightsQuery(q, data.fields);
    const tz = data.event.timezone || 'Africa/Lagos';
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const answerFields = data.fields.filter((f) => f.type !== 'info');
    const header = [
      `Registered (${tz})`,
      'Name',
      'Email',
      'Status',
      'VIP',
      'Tickets',
      'Checked in',
      'Paid',
      ...answerFields.map((f) => f.label),
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const r of data.registrations) {
      if (!matches(r, filters, data.fields)) continue;
      const live = r.tickets.filter(
        (t) => (t.status === 'issued' || t.status === 'checked_in') && (!filters.tierId || t.tierId === filters.tierId),
      );
      const paid = r.paid.map((p) => `${p.currency} ${(p.totalMinor / 100).toFixed(2)}`).join('; ');
      lines.push(
        [
          fmt.format(r.createdAt),
          r.name,
          r.email,
          r.status,
          r.isVip ? 'Yes' : 'No',
          live.map((t) => t.tierName).join('; '),
          `${live.filter((t) => t.checkedInAt).length} of ${live.length}`,
          paid,
          ...answerFields.map((f) =>
            f.type === 'select' || f.type === 'multiselect' || f.type === 'checkbox'
              ? answersFor(r, f).join('; ')
              : (r.formResponses?.[f.id] ?? ''),
          ),
        ]
          .map(csvCell)
          .join(','),
      );
    }
    const slug = (data.event.title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event';
    return { filename: `${slug}-attendees.csv`, csv: `\uFEFF${lines.join('\r\n')}\r\n` };
  }
}
