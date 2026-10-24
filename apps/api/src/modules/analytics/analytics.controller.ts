import { Controller, Get, NotFoundException, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AnalyticsService, type InsightsQuery } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @Roles('staff')
  overview(@Param('orgId') orgId: string) {
    return this.analytics.overview(orgId);
  }

  /**
   * Marketing-shaped roll-up across all events in the org. Powers the
   * `/dashboard/analytics` page: 12-month trend, conversion funnel, per-event
   * breakdown, totals, revenue by currency.
   */
  @Get('rollup')
  @Roles('staff')
  rollup(@Param('orgId') orgId: string) {
    return this.analytics.rollup(orgId);
  }

  @Get('events/:eventId')
  @Roles('staff')
  async event(@Param('orgId') orgId: string, @Param('eventId') eventId: string) {
    const result = await this.analytics.eventOverview(orgId, eventId);
    if (!result) throw new NotFoundException('Event not found');
    return result;
  }

  /**
   * Insights: the event's registrations sliced by date, tier, status, VIP and
   * registration-form answers. Query: from, to (ISO), tier, status, vip
   * (yes|no), field + value, groupBy (tier|status|vip|field:<id>).
   */
  @Get('events/:eventId/insights')
  @Roles('staff')
  async insights(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Query() q: InsightsQuery,
  ) {
    const result = await this.analytics.eventInsights(orgId, eventId, q ?? {});
    if (!result) throw new NotFoundException('Event not found');
    return result;
  }

  /** The same filtered attendee list as a CSV download. */
  @Get('events/:eventId/insights.csv')
  @Roles('staff')
  async insightsCsv(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Query() q: InsightsQuery,
    @Res() res: { setHeader: (k: string, v: string) => void; send: (b: string) => void },
  ) {
    const out = await this.analytics.eventInsightsCsv(orgId, eventId, q ?? {});
    if (!out) throw new NotFoundException('Event not found');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(out.csv);
  }
}
