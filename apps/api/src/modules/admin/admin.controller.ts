import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { SuperAdmin } from '../../common/decorators/platform.decorator';
import { PlatformGuard } from '../../common/guards/platform.guard';
import { PaymentsService } from '../payments/payments.service';
import { AdminService, PLATFORM_ROLES, type PlatformRoleValue } from './admin.service';

class SetPlatformRoleDto {
  @IsIn(PLATFORM_ROLES as unknown as string[])
  role!: PlatformRoleValue;
}

const HOLD_ACTIONS = ['recheck', 'cancel'] as const;

class ResolveSettlementHoldDto {
  @IsIn(HOLD_ACTIONS as unknown as string[])
  action!: (typeof HOLD_ACTIONS)[number];
}

function toNum(v?: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Orkora platform console. Every route requires a super admin (PlatformGuard
 * defaults to super-admin-only). This surface is cross-org by design.
 */
@ApiTags('admin')
@ApiBearerAuth()
@SuperAdmin()
@UseGuards(AuthGuard('jwt'), PlatformGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly payments: PaymentsService,
  ) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('organizations')
  organizations(
    @Query('q') q?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.admin.listOrganizations({ q, take: toNum(take), skip: toNum(skip) });
  }

  @Post('organizations/:id/suspend')
  suspend(@Param('id') id: string) {
    return this.admin.setOrganizationStatus(id, 'suspended');
  }

  @Post('organizations/:id/restore')
  restore(@Param('id') id: string) {
    return this.admin.setOrganizationStatus(id, 'active');
  }

  @Get('users')
  users(@Query('q') q?: string, @Query('take') take?: string, @Query('skip') skip?: string) {
    return this.admin.listUsers({ q, take: toNum(take), skip: toNum(skip) });
  }

  @Post('users/:id/platform-role')
  setPlatformRole(@Param('id') id: string, @Body() dto: SetPlatformRoleDto) {
    return this.admin.setPlatformRole(id, dto.role);
  }

  /**
   * Orders held by the settlement amount check. Each row is money sitting with
   * a payment provider against a ticket that was never issued, and nothing
   * automated will resolve it. This list is the operational counterpart to the
   * gate in PaymentsService: without it the fix trades a silent bad settlement
   * for a silent stuck one.
   */
  @Get('settlement-holds')
  settlementHolds(@Query('take') take?: string, @Query('skip') skip?: string) {
    return this.admin.listSettlementHolds({ take: toNum(take), skip: toNum(skip) });
  }

  /**
   * `recheck` re-queries the provider and settles if the amounts now agree.
   * `cancel` fails the order and releases its seats; refund at the provider
   * first, this does not move money.
   */
  @Post('settlement-holds/:orderId/resolve')
  resolveSettlementHold(
    @Param('orderId') orderId: string,
    @Body() dto: ResolveSettlementHoldDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    return this.payments.resolveSettlementHold({
      orderId,
      action: dto.action,
      actorUserId: user.userId,
      requestId: req.id,
    });
  }

  @Get('events')
  events(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.admin.listEvents({ q, status, take: toNum(take), skip: toNum(skip) });
  }
}
