import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { SuperAdmin } from '../../common/decorators/platform.decorator';
import { PlatformGuard } from '../../common/guards/platform.guard';
import { PaymentsService } from '../payments/payments.service';
import { AdminService, PLATFORM_ROLES, type PlatformRoleValue } from './admin.service';
import { AdminDeletionService } from './admin-deletion.service';

class SetPlatformRoleDto {
  @IsIn(PLATFORM_ROLES as unknown as string[])
  role!: PlatformRoleValue;
}

/** Typed confirmation for destructive actions (the user's email or the org's name). */
class ConfirmDto {
  @IsString()
  @MaxLength(320)
  confirm!: string;
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
    private readonly deletion: AdminDeletionService,
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
  users(
    @Query('q') q?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('segment') segment?: string,
    @Query('sort') sort?: string,
  ) {
    return this.admin.listUsers({ q, take: toNum(take), skip: toNum(skip), segment, sort });
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

  // ----- deletion (super admin only, like everything in this controller) -----

  /** What deleting or erasing this user would remove, and anything blocking it. */
  @Get('users/:id/deletion-preview')
  previewUserDeletion(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.deletion.previewUser(id, user.userId);
  }

  /** Permanently delete a user with no financial history. Body: { confirm: <their email> }. */
  @Post('users/:id/delete')
  deleteUser(
    @Param('id') id: string,
    @Body() dto: ConfirmDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    return this.deletion.deleteUser(id, user.userId, dto.confirm, req.id);
  }

  /** Scrub a user's personal details but keep their records. Body: { confirm: <their email> }. */
  @Post('users/:id/erase')
  eraseUser(
    @Param('id') id: string,
    @Body() dto: ConfirmDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    return this.deletion.eraseUser(id, user.userId, dto.confirm, req.id);
  }

  @Get('organizations/:id/deletion-preview')
  previewOrganizationDeletion(@Param('id') id: string) {
    return this.deletion.previewOrganization(id);
  }

  /** Permanently delete an organization that never took money. Body: { confirm: <its name> }. */
  @Post('organizations/:id/delete')
  deleteOrganization(
    @Param('id') id: string,
    @Body() dto: ConfirmDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    return this.deletion.deleteOrganization(id, user.userId, dto.confirm, req.id);
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
