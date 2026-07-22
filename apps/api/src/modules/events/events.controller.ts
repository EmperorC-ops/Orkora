import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { EventsService } from './events.service';
import {
  CreateEventDto,
  CreateSessionDto,
  CreateSpeakerDto,
  UpdateSpeakerDto,
  CreateTicketTierDto,
  CreateTrackDto,
  EventStatus,
  ReorderTicketTiersDto,
  UpdateEventDto,
  UpdateSessionDto,
  UpdateTicketTierDto,
} from './dto/event.dto';

/**
 * Public, unauthenticated reads. Used by the attendee mobile app's "join an
 * event" flow and by the public web event landing page.
 */
@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('by-code/:code')
  findByCode(@Param('code') code: string) {
    return this.events.findPublicByCode(code);
  }

  @Get('by-slug/:orgSlug/:eventSlug')
  findBySlug(
    @Param('orgSlug') orgSlug: string,
    @Param('eventSlug') eventSlug: string,
  ) {
    return this.events.findPublicBySlug(orgSlug, eventSlug);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id') id: string) {
    return this.events.findById(id);
  }
}

/**
 * Organizer-facing endpoints. All nested under
 * /v1/organizations/:orgId/events with a RolesGuard membership check.
 */
@ApiTags('organizer-events')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/events')
export class OrganizerEventsController {
  constructor(private readonly events: EventsService) {}

  // ---- Events ----

  @Post()
  @Roles('owner', 'admin', 'organizer')
  create(@Param('orgId') orgId: string, @Body() dto: CreateEventDto) {
    return this.events.createForOrg(orgId, dto);
  }

  @Get()
  @Roles('owner', 'admin', 'organizer', 'staff')
  list(@Param('orgId') orgId: string, @Query('status') status?: EventStatus) {
    return this.events.listForOrg(orgId, status);
  }

  @Get(':eventId')
  @Roles('owner', 'admin', 'organizer', 'staff')
  get(@Param('orgId') orgId: string, @Param('eventId') eventId: string) {
    return this.events.getForOrg(orgId, eventId);
  }

  @Patch(':eventId')
  @Roles('owner', 'admin', 'organizer')
  update(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.update(orgId, eventId, dto);
  }

  @Post(':eventId/publish')
  @HttpCode(200)
  @Roles('owner', 'admin', 'organizer')
  publish(@Param('orgId') orgId: string, @Param('eventId') eventId: string) {
    return this.events.publish(orgId, eventId);
  }

  @Post(':eventId/unpublish')
  @HttpCode(200)
  @Roles('owner', 'admin', 'organizer')
  unpublish(@Param('orgId') orgId: string, @Param('eventId') eventId: string) {
    return this.events.unpublish(orgId, eventId);
  }

  @Post(':eventId/archive')
  @HttpCode(200)
  @Roles('owner', 'admin')
  archive(@Param('orgId') orgId: string, @Param('eventId') eventId: string) {
    return this.events.archive(orgId, eventId);
  }

  @Delete(':eventId')
  @Roles('owner', 'admin')
  remove(@Param('orgId') orgId: string, @Param('eventId') eventId: string) {
    return this.events.deleteEvent(orgId, eventId);
  }

  // ---- Tracks ----

  @Post(':eventId/tracks')
  @Roles('owner', 'admin', 'organizer')
  createTrack(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Body() dto: CreateTrackDto,
  ) {
    return this.events.createTrack(orgId, eventId, dto);
  }

  @Get(':eventId/tracks')
  @Roles('owner', 'admin', 'organizer', 'staff')
  listTracks(@Param('orgId') orgId: string, @Param('eventId') eventId: string) {
    return this.events.listTracks(orgId, eventId);
  }

  @Delete(':eventId/tracks/:trackId')
  @Roles('owner', 'admin', 'organizer')
  deleteTrack(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Param('trackId') trackId: string,
  ) {
    return this.events.deleteTrack(orgId, eventId, trackId);
  }

  // ---- Sessions ----

  @Post(':eventId/sessions')
  @Roles('owner', 'admin', 'organizer')
  createSession(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Body() dto: CreateSessionDto,
  ) {
    return this.events.createSession(orgId, eventId, dto);
  }

  @Patch(':eventId/sessions/:sessionId')
  @Roles('owner', 'admin', 'organizer')
  updateSession(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.events.updateSession(orgId, eventId, sessionId, dto);
  }

  @Delete(':eventId/sessions/:sessionId')
  @Roles('owner', 'admin', 'organizer')
  deleteSession(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.events.deleteSession(orgId, eventId, sessionId);
  }

  // ---- Speakers ----

  @Post(':eventId/speakers')
  @Roles('owner', 'admin', 'organizer')
  createSpeaker(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Body() dto: CreateSpeakerDto,
  ) {
    return this.events.createSpeaker(orgId, eventId, dto);
  }

  @Get(':eventId/speakers')
  @Roles('owner', 'admin', 'organizer', 'staff')
  listSpeakers(@Param('orgId') orgId: string, @Param('eventId') eventId: string) {
    return this.events.listSpeakers(orgId, eventId);
  }

  @Patch(':eventId/speakers/:speakerId')
  @Roles('owner', 'admin', 'organizer')
  updateSpeaker(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Param('speakerId') speakerId: string,
    @Body() dto: UpdateSpeakerDto,
  ) {
    return this.events.updateSpeaker(orgId, eventId, speakerId, dto);
  }

  @Delete(':eventId/speakers/:speakerId')
  @Roles('owner', 'admin', 'organizer')
  deleteSpeaker(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Param('speakerId') speakerId: string,
  ) {
    return this.events.deleteSpeaker(orgId, eventId, speakerId);
  }

  // ---- Ticket tiers ----

  @Post(':eventId/tiers')
  @Roles('owner', 'admin', 'organizer')
  createTier(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Body() dto: CreateTicketTierDto,
  ) {
    return this.events.createTier(orgId, eventId, dto);
  }

  @Get(':eventId/tiers')
  @Roles('owner', 'admin', 'organizer', 'staff')
  listTiers(@Param('orgId') orgId: string, @Param('eventId') eventId: string) {
    return this.events.listTiers(orgId, eventId);
  }

  @Patch(':eventId/tiers/:tierId')
  @Roles('owner', 'admin', 'organizer')
  updateTier(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Param('tierId') tierId: string,
    @Body() dto: UpdateTicketTierDto,
  ) {
    return this.events.updateTier(orgId, eventId, tierId, dto);
  }

  @Delete(':eventId/tiers/:tierId')
  @Roles('owner', 'admin', 'organizer')
  deleteTier(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Param('tierId') tierId: string,
  ) {
    return this.events.deleteTier(orgId, eventId, tierId);
  }

  @Put(':eventId/tiers/reorder')
  @HttpCode(200)
  @Roles('owner', 'admin', 'organizer')
  reorderTiers(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Body() dto: ReorderTicketTiersDto,
  ) {
    return this.events.reorderTiers(orgId, eventId, dto);
  }
}
