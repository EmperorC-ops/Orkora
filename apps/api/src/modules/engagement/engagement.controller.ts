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
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { EngagementGateway } from './engagement.gateway';
import { EngagementService } from './engagement.service';

interface CreatePollDto {
  sessionId: string;
  question: string;
  options: string[];
  multiSelect?: boolean;
}

class SetAnsweredDto {
  @IsBoolean()
  answered!: boolean;
}

class SetHiddenDto {
  @IsBoolean()
  hidden!: boolean;
}

class SpotlightDto {
  @IsIn(['announcement', 'link', 'video'])
  kind!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;
}

/**
 * Public read for the event chat channel and active polls. Used by the
 * web public engagement tab to bootstrap before the websocket joins.
 */
@ApiTags('engagement')
@Controller('events/:eventId/engagement')
export class PublicEngagementController {
  constructor(private readonly service: EngagementService) {}

  @Get('chat')
  async chat(@Param('eventId') eventId: string) {
    const channel = await this.service.getOrCreateEventChat(eventId);
    const messages = await this.service.listMessages(eventId, channel.id, 50);
    return { channelId: channel.id, messages };
  }

  @Get('polls')
  polls(@Param('eventId') eventId: string) {
    return this.service.listPollsForEvent(eventId);
  }

  @Get('questions')
  questions(@Param('eventId') eventId: string) {
    return this.service.listQuestions(eventId);
  }

  @Get('spotlight')
  spotlight(@Param('eventId') eventId: string) {
    return this.service.getSpotlight(eventId);
  }
}

/**
 * Organizer-side poll management.
 */
@ApiTags('engagement-organizer')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/events/:eventId/polls')
export class OrganizerPollsController {
  constructor(
    private readonly service: EngagementService,
    private readonly gateway: EngagementGateway,
  ) {}

  @Get()
  @Roles('owner', 'admin', 'organizer')
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.service.listPolls(orgId, eventId);
  }

  @Post()
  @Roles('organizer')
  async create(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Body() dto: CreatePollDto,
  ) {
    const poll = await this.service.createPoll({ ...dto, orgId, eventId });
    const shaped = await this.service.getPoll(poll.id);
    this.gateway.emitPollUpdate(eventId, shaped);
    return shaped;
  }

  @Post(':pollId/close')
  @Roles('organizer')
  async close(
    @Param('orgId') orgId: string,
    @Param('eventId') eventId: string,
    @Param('pollId') pollId: string,
  ) {
    const closed = await this.service.closePoll({ orgId, eventId, pollId });
    this.gateway.emitPollUpdate(eventId, closed);
    return closed;
  }
}

/**
 * Organizer-side Q&A moderation. Nested under organizations/:orgId so the
 * RolesGuard + tenancy checks apply; the service also re-verifies organizer
 * membership on the question's own event before mutating.
 */
@ApiTags('engagement-organizer')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/events/:eventId/qa')
export class OrganizerQaController {
  constructor(private readonly service: EngagementService) {}

  @Get()
  @Roles('owner', 'admin', 'organizer')
  list(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listQuestionsForOrganizer(eventId, user.userId);
  }

  @Patch(':questionId/answered')
  @Roles('owner', 'admin', 'organizer')
  setAnswered(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetAnsweredDto,
  ) {
    return this.service.markQuestionAnswered({
      questionId,
      userId: user.userId,
      answered: dto.answered,
    });
  }

  @Patch(':questionId/hidden')
  @Roles('owner', 'admin', 'organizer')
  setHidden(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetHiddenDto,
  ) {
    return this.service.setQuestionHidden({
      questionId,
      userId: user.userId,
      hidden: dto.hidden,
    });
  }
}

/**
 * Organizer control for the live "on screen now" spotlight. Setting or clearing
 * it broadcasts to every participant in the event room via the gateway.
 */
@ApiTags('engagement-organizer')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/events/:eventId/spotlight')
export class OrganizerSpotlightController {
  constructor(
    private readonly service: EngagementService,
    private readonly gateway: EngagementGateway,
  ) {}

  @Post()
  @Roles('owner', 'admin', 'organizer')
  async set(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SpotlightDto,
  ) {
    const spotlight = await this.service.setSpotlight(orgId, eventId, dto, user.userId);
    this.gateway.emitSpotlightUpdate(eventId, spotlight);
    return spotlight;
  }

  @Delete()
  @Roles('owner', 'admin', 'organizer')
  async clear(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    await this.service.clearSpotlight(orgId, eventId);
    this.gateway.emitSpotlightUpdate(eventId, null);
    return { ok: true };
  }
}
