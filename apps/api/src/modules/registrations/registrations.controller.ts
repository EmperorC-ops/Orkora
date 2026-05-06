import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import {
  OrgAttendeeListQueryDto,
  OrgRegistrationListQueryDto,
  RegisterAttendeesDto,
  RegistrationListQueryDto,
} from './dto/registration.dto';
import { RegistrationsService } from './registrations.service';

/**
 * Public-facing registration. No auth: an attendee with the event code can
 * register straight from the public landing page or the mobile app.
 */
@ApiTags('registrations')
@Controller('events')
export class PublicRegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('by-code/:code/register')
  @HttpCode(201)
  register(@Param('code') code: string, @Body() dto: RegisterAttendeesDto) {
    return this.service.register(code, dto);
  }
}

/**
 * Public ticket lookup by code. The unique ticket code arrives in the
 * confirmation email; sharing the URL is intentional within a small group
 * but the QR token bound to the ticket is what actually authorises check-in.
 */
@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly service: RegistrationsService) {}

  @Get('by-code/:code')
  getByCode(@Param('code') code: string) {
    return this.service.getTicketByCode(code);
  }
}

/**
 * Authenticated attendee endpoints. Returns tickets attached to the signed-in
 * user across every event they registered for.
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me')
export class MeRegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  @Get('tickets')
  myTickets(@CurrentUser() user: AuthUser) {
    return this.service.listMyTickets(user.userId);
  }
}

/**
 * Organizer-side registrations list, scoped by org and event.
 */
@ApiTags('organizer-registrations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/events/:eventId/registrations')
export class OrganizerRegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  @Get()
  @Roles('staff')
  list(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Query() query: RegistrationListQueryDto,
  ) {
    return this.service.listForOrgEvent(orgId, eventId, query);
  }
}

/**
 * Org-wide registrations and attendees endpoints. These power the four
 * sidebar pages that span every event the org owns.
 */
@ApiTags('organizer-org-registrations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId')
export class OrgRegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  @Get('registrations')
  @Roles('staff')
  listRegistrations(
    @Param('orgId') orgId: string,
    @Query() query: OrgRegistrationListQueryDto,
  ) {
    return this.service.listForOrg(orgId, query);
  }

  @Get('attendees')
  @Roles('staff')
  listAttendees(
    @Param('orgId') orgId: string,
    @Query() query: OrgAttendeeListQueryDto,
  ) {
    return this.service.attendeesForOrg(orgId, query);
  }

  @Get('attendees/:userId')
  @Roles('staff')
  attendeeDetail(@Param('orgId') orgId: string, @Param('userId') userId: string) {
    return this.service.attendeeDetailForOrg(orgId, userId);
  }
}

/**
 * Check-in endpoints: scanner-app POSTs the verified QR token, server-side
 * verifies the HMAC, looks up the ticket, and flips it to checked-in.
 * Tenancy enforced via RolesGuard.
 */
@ApiTags('checkin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/events/:eventId/checkin')
export class CheckinController {
  constructor(private readonly service: RegistrationsService) {}

  @Post()
  @Roles('staff')
  checkIn(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Body() body: { qrToken: string },
  ) {
    return this.service.checkIn(orgId, eventId, body.qrToken);
  }

  @Get('stats')
  @Roles('staff')
  stats(@Param('orgId') orgId: string, @Param('eventId') eventId: string) {
    return this.service.getCheckinStats(orgId, eventId);
  }
}
