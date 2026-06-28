/**
 * Campaigns controller.
 *
 * All routes are scoped to /v1/organizations/:orgId so the existing
 * RolesGuard + tenancy interceptor apply. The Postmark webhook and
 * the public unsubscribe endpoint sit outside that scope (no JWT
 * required) and use HMAC verification instead.
 *
 * Throttling: campaign mutations are rate-limited tighter than read
 * endpoints to keep abuse from a single org down. Public webhook and
 * unsubscribe routes are open to the world but anchored on their own
 * crypto checks.
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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CampaignsService } from './campaigns.service';
import {
  CreateAudienceDto,
  CreateCampaignDto,
  PatchCampaignDto,
  ScheduleCampaignDto,
  TestSendDto,
} from './dto/campaign.dto';

@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  // ------------ AUDIENCES ------------

  @Get('audiences')
  @Roles('owner', 'admin', 'organizer')
  listAudiences(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.campaigns.listAudiences(orgId);
  }

  @Post('audiences')
  @Roles('owner', 'admin')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createAudience(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAudienceDto,
  ) {
    return this.campaigns.createAudience(orgId, user.userId, dto);
  }

  @Get('audiences/:audienceId/preview')
  @Roles('owner', 'admin', 'organizer')
  previewAudience(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('audienceId', ParseUUIDPipe) audienceId: string,
  ) {
    return this.campaigns.previewAudience(audienceId, orgId);
  }

  @Post('audiences/:audienceId/refresh')
  @Roles('owner', 'admin', 'organizer')
  refreshAudience(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('audienceId', ParseUUIDPipe) audienceId: string,
  ) {
    return this.campaigns.refreshAudienceCount(audienceId, orgId);
  }

  // ------------ CAMPAIGNS ------------

  @Get('campaigns')
  @Roles('owner', 'admin', 'organizer')
  list(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.campaigns.list(orgId);
  }

  @Post('campaigns')
  @Roles('owner', 'admin')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaigns.create(orgId, user.userId, dto);
  }

  @Get('campaigns/:id')
  @Roles('owner', 'admin', 'organizer')
  get(@Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.get(id, orgId);
  }

  @Patch('campaigns/:id')
  @Roles('owner', 'admin')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  patch(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchCampaignDto,
  ) {
    return this.campaigns.patch(id, orgId, dto);
  }

  @Delete('campaigns/:id')
  @Roles('owner', 'admin')
  delete(@Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.delete(id, orgId);
  }

  @Post('campaigns/:id/test-send')
  @Roles('owner', 'admin')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  testSend(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestSendDto,
  ) {
    return this.campaigns.testSend(id, orgId, dto.email);
  }

  @Post('campaigns/:id/send')
  @Roles('owner', 'admin')
  // The expensive operation. Two sends/min per org is enough headroom
  // for legitimate use and an aggressive ceiling against accidental
  // double-fires from a click-happy organizer.
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  send(@Param('orgId', ParseUUIDPipe) orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.sendNow(id, orgId);
  }
}

/**
 * Public-surface webhook + unsubscribe routes. Not tenancy-scoped;
 * they discover the org from the message id / unsubscribe token.
 */
@ApiTags('campaigns-public')
@Controller()
export class CampaignsPublicController {
  constructor(private readonly campaigns: CampaignsService) {}

  /**
   * Postmark webhook. The signature header is checked at the
   * NestJS-level guard if POSTMARK_WEBHOOK_SECRET is configured;
   * Slice A keeps it open and relies on message-id correlation.
   * Slice D adds the signed-payload check.
   */
  @Post('webhooks/postmark')
  postmarkWebhook(@Body() body: unknown, @Req() _req: Request) {
    // Postmark sends ONE event per POST, not a batch.
    return this.campaigns.handlePostmarkWebhook(body as never);
  }

  /**
   * One-click unsubscribe. The link arrives in the recipient's email
   * footer. No auth required - the HMAC in `s` proves the request is
   * legitimate. CAN-SPAM compliant: a single click is sufficient.
   */
  @Get('me/unsubscribe')
  unsubscribe(@Query('c') c: string, @Query('e') e: string, @Query('s') s: string) {
    return this.campaigns.unsubscribe(c, e, s);
  }
}
