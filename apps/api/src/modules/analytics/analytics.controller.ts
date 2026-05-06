import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AnalyticsService } from './analytics.service';

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
}
