import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { InvitesService } from './invites.service';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsEnum(['admin', 'organizer', 'staff', 'vendor'])
  role!: 'admin' | 'organizer' | 'staff' | 'vendor';
}

class AcceptInviteDto {
  @IsString()
  @MinLength(20)
  token!: string;
}

@ApiTags('invitations')
@ApiBearerAuth()
@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  /**
   * Create an invitation for an organization. Restricted to owner or admin.
   * The org id comes from the path so the RolesGuard can resolve it cleanly.
   */
  @Post('organizations/:orgId/invitations')
  @HttpCode(201)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('owner', 'admin')
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateInviteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invites.create({
      organizationId: orgId,
      email: dto.email,
      role: dto.role,
      invitedById: user.userId,
    });
  }

  @Get('organizations/:orgId/invitations')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('owner', 'admin', 'organizer')
  async list(@Param('orgId') orgId: string) {
    return this.invites.listForOrg(orgId);
  }

  @Delete('organizations/:orgId/invitations/:invitationId')
  @HttpCode(204)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('owner', 'admin')
  async revoke(@Param('orgId') orgId: string, @Param('invitationId') invitationId: string) {
    await this.invites.revoke(orgId, invitationId);
  }

  /**
   * The accept endpoint sits under /invitations because the caller is not
   * yet a member. It only requires the token + an authenticated user whose
   * email matches.
   */
  @Post('invitations/accept')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async accept(@Body() dto: AcceptInviteDto, @CurrentUser() user: AuthUser) {
    return this.invites.accept({ token: dto.token, userId: user.userId });
  }
}
