import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtOrApiKeyGuard } from '../auth/strategies/api-key.guard';
import { RequireScope } from '../auth/strategies/api-key.decorator';
import { EventsService } from './events.service';

/**
 * Public-API surface for org-scoped reads. Accessible to:
 *
 *   - Logged-in organizers / staff (JWT in Authorization header) who are
 *     members of the organization in the path.
 *   - External integrators using an organization API key
 *     (`Authorization: Bearer ork_…`) with `events.read` scope, scoped to
 *     the organization the key belongs to.
 *
 * The composite `JwtOrApiKeyGuard` resolves the auth path. Because API-key
 * callers have no org role in the JWT sense, we cannot rely on RolesGuard;
 * instead this controller enforces org binding directly (`assertOrgAccess`)
 * so a member of, or a key for, org A can never read org B by changing the
 * path. Only published events are exposed.
 */

// Statuses considered public. Drafts and archived events are never exposed.
const PUBLIC_STATUSES = new Set(['published', 'live', 'ended']);

interface ApiKeyUser {
  source: 'api-key';
  orgId: string;
}
interface JwtUser {
  userId?: string;
  memberships?: { orgId: string; role: string }[];
}

@ApiTags('public-api')
@ApiBearerAuth()
@UseGuards(JwtOrApiKeyGuard)
@Controller('organizations/:orgId/public/events')
export class PublicApiEventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * Enforce that the caller is bound to the org in the path. API keys must
   * belong to it; JWT users must hold a membership in it. Prevents
   * cross-tenant reads via a mismatched path.
   */
  private assertOrgAccess(req: Request, orgId: string): void {
    const user = (req as Request & { user?: ApiKeyUser | JwtUser }).user;
    if (!user) throw new ForbiddenException('Not authenticated');

    if ((user as ApiKeyUser).source === 'api-key') {
      if ((user as ApiKeyUser).orgId !== orgId) {
        throw new ForbiddenException('API key is not scoped to this organization');
      }
      return;
    }

    const memberships = (user as JwtUser).memberships ?? [];
    if (!memberships.some((m) => m.orgId === orgId)) {
      throw new ForbiddenException('You are not a member of this organization');
    }
  }

  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Get()
  @RequireScope('events.read')
  async list(@Req() req: Request, @Param('orgId') orgId: string) {
    this.assertOrgAccess(req, orgId);
    // Public API exposes published events only; the client cannot request drafts.
    const events = await this.events.listForOrg(orgId, 'published');
    return {
      data: events,
      meta: { count: events.length },
    };
  }

  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Get(':eventId')
  @RequireScope('events.read')
  async get(
    @Req() req: Request,
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
  ) {
    this.assertOrgAccess(req, orgId);
    const event = await this.events.getForOrg(orgId, eventId);
    if (!event || !PUBLIC_STATUSES.has((event as { status?: string }).status ?? '')) {
      throw new NotFoundException('Event not found');
    }
    return { data: event };
  }
}
