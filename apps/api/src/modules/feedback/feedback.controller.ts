/**
 * Feedback controllers.
 *
 * Public submission (POST /v1/events/:code/feedback) is unauthenticated - the
 * event page is public and feedback is optional/anonymous - so it is throttled
 * tightly to keep a single client from flooding a room. The organizer read
 * (GET /v1/organizations/:orgId/events/:eventId/feedback) sits under the usual
 * JWT + RolesGuard + tenancy scope.
 */

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeedbackService } from './feedback.service';
import { SubmitFeedbackDto } from './dto/feedback.dto';

@ApiTags('feedback')
@Controller('events')
export class FeedbackPublicController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post(':code/feedback')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  submit(@Param('code') code: string, @Body() dto: SubmitFeedbackDto) {
    return this.feedback.submitPublic(code, dto);
  }
}

@ApiTags('organizer-feedback')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/events/:eventId')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get('feedback')
  @Roles('owner', 'admin', 'organizer', 'staff')
  summary(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.feedback.getEventSummary(orgId, eventId);
  }
}
