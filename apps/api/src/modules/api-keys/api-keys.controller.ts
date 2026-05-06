import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ApiKeysService, type ApiKeyScope } from './api-keys.service';

const ALLOWED_SCOPES = [
  'events.read',
  'events.write',
  'registrations.read',
  'registrations.write',
  'analytics.read',
] as const;

class CreateApiKeyDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ALLOWED_SCOPES as unknown as string[], { each: true })
  scopes?: ApiKeyScope[];
}

@ApiTags('api-keys')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/api-keys')
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  @Roles('owner', 'admin')
  list(@Param('orgId') orgId: string) {
    return this.keys.list(orgId);
  }

  @Post()
  @Roles('owner', 'admin')
  create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    return this.keys.create(
      {
        organizationId: orgId,
        createdById: user.userId,
        name: dto.name,
        scopes: dto.scopes,
      },
      req.id,
    );
  }

  @Delete(':keyId')
  @HttpCode(200)
  @Roles('owner', 'admin')
  revoke(
    @Param('orgId') orgId: string,
    @Param('keyId') keyId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    return this.keys.revoke(orgId, user.userId, keyId, req.id);
  }
}
