import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
} from 'class-validator';
import type { Request } from 'express';
import { OrgsService } from './orgs.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

class CreateOrgDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsString()
  @Length(2, 40)
  slug!: string;

  @IsOptional()
  @IsString()
  countryCode?: string;
}

class UpdateOrgDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 40)
  @Matches(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, {
    message: 'Slug must be lowercase, 2-40 chars, hyphen-separated',
  })
  slug?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  logoUrl?: string | null;

  @IsOptional()
  @IsHexColor()
  brandColor?: string | null;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  // Brand Home composer fields.
  @IsOptional()
  @IsString()
  @Length(0, 80)
  tagline?: string | null;

  @IsOptional()
  @IsIn(['default', 'cinematic', 'editorial'])
  heroVariant?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  heroMediaUrl?: string | null;

  @IsOptional()
  @IsIn(['image', 'video'])
  heroMediaType?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 400)
  heroBio?: string | null;
}

class SubscribeDto {
  @IsString()
  @Length(3, 320)
  email!: string;
}

class UpdateMemberRoleDto {
  @IsString()
  @IsIn(['owner', 'admin', 'organizer', 'staff', 'vendor'])
  role!: 'owner' | 'admin' | 'organizer' | 'staff' | 'vendor';
}

@ApiTags('organizations')
@ApiBearerAuth()
/**
 * Public Brand Home endpoint. Unauthenticated; powers orkora.events/o/<slug>.
 */
@ApiTags('public-brand')
@Controller('public/orgs')
export class PublicBrandController {
  constructor(private readonly orgs: OrgsService) {}

  @Get(':slug')
  getBrand(@Param('slug') slug: string) {
    return this.orgs.getPublicBrand(slug);
  }

  @Post(':slug/subscribe')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  subscribe(@Param('slug') slug: string, @Body() dto: SubscribeDto) {
    return this.orgs.subscribeToBrand(slug, dto.email);
  }
}

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreateOrgDto, @CurrentUser() user: AuthUser) {
    return this.orgs.create(user.userId, dto);
  }

  // Brand Home audience: total + recent subscribers, for the composer.
  @Get(':orgId/brand/subscribers')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('owner', 'admin', 'organizer')
  brandSubscribers(@Param('orgId') orgId: string) {
    return this.orgs.listBrandSubscribers(orgId);
  }

  @Get(':orgId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('staff')
  getOne(@Param('orgId') orgId: string) {
    return this.orgs.findById(orgId);
  }

  @Patch(':orgId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('owner', 'admin')
  update(
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrgDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    return this.orgs.update(orgId, user.userId, dto, req.id);
  }

  @Get(':orgId/members')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('staff')
  listMembers(@Param('orgId') orgId: string) {
    return this.orgs.listMembers(orgId);
  }

  @Patch(':orgId/members/:userId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('owner')
  updateMemberRole(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    return this.orgs.updateMemberRole(orgId, actor.userId, userId, dto.role, req.id);
  }

  @Delete(':orgId/members/:userId')
  @HttpCode(204)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('owner', 'admin')
  async removeMember(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    await this.orgs.removeMember(orgId, actor.userId, userId, req.id);
  }
}
