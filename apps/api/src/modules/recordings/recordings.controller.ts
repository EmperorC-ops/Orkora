/**
 * Recording controllers.
 *
 * Organizer routes (POST/GET/PATCH/DELETE) sit under the org+event scope with
 * the usual JWT + RolesGuard + tenancy. Public routes resolve the event by its
 * public code: a GET listing (metadata only, no gated URLs) and a POST play
 * endpoint. Play is a POST so the ticket code travels in the body, never in the
 * URL or the access logs.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RecordingsService } from './recordings.service';
import {
  CreateRecordingDto,
  UpdateRecordingDto,
} from './dto/recording.dto';

@ApiTags('organizer-recordings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/events/:eventId/recordings')
export class RecordingsController {
  constructor(private readonly recordings: RecordingsService) {}

  @Post()
  @Roles('owner', 'admin', 'organizer')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateRecordingDto,
  ) {
    return this.recordings.createRecording(orgId, eventId, dto);
  }

  @Get()
  @Roles('owner', 'admin', 'organizer', 'staff')
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.recordings.listForOrganizer(orgId, eventId);
  }

  @Patch(':recordingId')
  @Roles('owner', 'admin', 'organizer')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('recordingId', ParseUUIDPipe) recordingId: string,
    @Body() dto: UpdateRecordingDto,
  ) {
    return this.recordings.updateRecording(orgId, eventId, recordingId, dto);
  }

  @Delete(':recordingId')
  @Roles('owner', 'admin', 'organizer')
  remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('recordingId', ParseUUIDPipe) recordingId: string,
  ) {
    return this.recordings.deleteRecording(orgId, eventId, recordingId);
  }
}

@ApiTags('recordings')
@Controller('events')
export class RecordingsPublicController {
  constructor(private readonly recordings: RecordingsService) {}

  @Get(':code/recordings')
  list(@Param('code') code: string) {
    return this.recordings.listPublic(code);
  }

  @Post(':code/recordings/:recordingId/play')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  play(
    @Param('code') code: string,
    @Param('recordingId', ParseUUIDPipe) recordingId: string,
    @Body() body: { ticketCode?: string },
  ) {
    return this.recordings.resolvePlayback(code, recordingId, body?.ticketCode);
  }
}
