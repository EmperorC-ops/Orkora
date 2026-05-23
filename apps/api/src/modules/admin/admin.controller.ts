import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SuperAdmin } from '../../common/decorators/platform.decorator';
import { PlatformGuard } from '../../common/guards/platform.guard';
import { AdminService, PLATFORM_ROLES, type PlatformRoleValue } from './admin.service';

class SetPlatformRoleDto {
  @IsIn(PLATFORM_ROLES as unknown as string[])
  role!: PlatformRoleValue;
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
  constructor(private readonly admin: AdminService) {}

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
