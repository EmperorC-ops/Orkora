/**
 * Discount code controllers.
 *
 * The organizer surface (POST/GET/PATCH/DELETE under
 * /v1/organizations/:orgId/events/:eventId/discounts) sits behind the usual
 * JWT + RolesGuard + tenancy scope. The public validation endpoint
 * (POST /v1/events/:code/discounts/validate) is unauthenticated - the register
 * page calls it before checkout - so it is throttled to keep a single client
 * from brute-forcing codes.
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
import { DiscountsService } from './discounts.service';
import {
  CreateDiscountCodeDto,
  UpdateDiscountCodeDto,
  ValidateDiscountDto,
} from './dto/discount.dto';

@ApiTags('discounts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/events/:eventId/discounts')
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Post()
  @Roles('owner', 'admin', 'organizer')
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateDiscountCodeDto,
  ) {
    return this.discounts.createCode(orgId, eventId, dto);
  }

  @Get()
  @Roles('owner', 'admin', 'organizer', 'staff')
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.discounts.listCodes(orgId, eventId);
  }

  @Patch(':codeId')
  @Roles('owner', 'admin', 'organizer')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('codeId', ParseUUIDPipe) codeId: string,
    @Body() dto: UpdateDiscountCodeDto,
  ) {
    return this.discounts.updateCode(orgId, eventId, codeId, dto);
  }

  @Delete(':codeId')
  @Roles('owner', 'admin', 'organizer')
  remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('codeId', ParseUUIDPipe) codeId: string,
  ) {
    return this.discounts.deleteCode(orgId, eventId, codeId);
  }
}

@ApiTags('discounts-public')
@Controller('events')
export class DiscountsPublicController {
  constructor(private readonly discounts: DiscountsService) {}

  @Post(':code/discounts/validate')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  validate(@Param('code') code: string, @Body() dto: ValidateDiscountDto) {
    return this.discounts.validatePublic(code, dto);
  }
}
