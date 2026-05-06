import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtOrApiKeyGuard } from '../auth/strategies/api-key.guard';
import { RequireScope } from '../auth/strategies/api-key.decorator';
import { EventsService } from './events.service';
import type { EventStatus } from './dto/event.dto';

/**
 * Public-API surface for org-scoped reads. Accessible to:
 *
 *   - Logged-in organizers / staff (JWT in Authorization header)
 *   - External integrators using an organization API key
 *     (`Authorization: Bearer ork_…`) with `events.read` scope.
 *
 * The composite `JwtOrApiKeyGuard` resolves the auth path. RolesGuard is
 * NOT mounted here because API key holders don't have a role in the JWT
 * sense; instead, scope enforcement happens via `@RequireScope`.
 *
 * This is the first slice of an external-facing read surface. We expose
 * only published events (no drafts) by default to keep the contract narrow
 * until we do a proper API stability review.
 */
@ApiTags('public-api')
@ApiBearerAuth()
@UseGuards(JwtOrApiKeyGuard)
@Controller('organizations/:orgId/public/events')
export class PublicApiEventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * List events. Filter by status; defaults to published. Capped at the
   * service-level page size; no pagination cursor yet (planned for a
   * follow-up once the contract stabilises).
   */
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Get()
  @RequireScope('events.read')
  async list(
    @Param('orgId') orgId: string,
    @Query('status') status?: EventStatus,
  ) {
    const events = await this.events.listForOrg(orgId, status ?? 'published');
    return {
      data: events,
      meta: { count: events.length },
    };
  }

  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Get(':eventId')
  @RequireScope('events.read')
  async get(@Param('orgId') orgId: string, @Param('eventId') eventId: string) {
    const event = await this.events.getForOrg(orgId, eventId);
    if (!event) throw new NotFoundException('Event not found');
    return { data: event };
  }
}
