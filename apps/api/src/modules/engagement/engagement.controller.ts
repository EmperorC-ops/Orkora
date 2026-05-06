import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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

  @Post()
  @Roles('organizer')
  async create(
    @Param('eventId') eventId: string,
    @Body() dto: CreatePollDto,
  ) {
    const poll = await this.service.createPoll(dto);
    const shaped = await this.service.getPoll(poll.id);
    this.gateway.emitPollUpdate(eventId, shaped);
    return shaped;
  }

  @Post(':pollId/close')
  @Roles('organizer')
  async close(@Param('eventId') eventId: string, @Param('pollId') pollId: string) {
    const closed = await this.service.closePoll(pollId);
    this.gateway.emitPollUpdate(eventId, closed);
    return closed;
  }
}
