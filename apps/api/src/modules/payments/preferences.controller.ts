import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaymentPreferencesService } from './preferences.service';

class UpsertPreferenceDto {
  @IsString()
  @IsIn(['stripe', 'paystack', 'flutterwave'])
  provider!: 'stripe' | 'paystack' | 'flutterwave';
}

@ApiTags('payment-preferences')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/payment-preferences')
export class PaymentPreferencesController {
  constructor(private readonly prefs: PaymentPreferencesService) {}

  @Get()
  @Roles('staff')
  list(@Param('orgId') orgId: string) {
    return this.prefs.list(orgId);
  }

  @Put(':currency')
  @Roles('owner', 'admin')
  upsert(
    @Param('orgId') orgId: string,
    @Param('currency') currency: string,
    @Body() dto: UpsertPreferenceDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    return this.prefs.upsert(orgId, user.userId, currency, dto.provider, req.id);
  }

  @Delete(':currency')
  @HttpCode(204)
  @Roles('owner', 'admin')
  async remove(
    @Param('orgId') orgId: string,
    @Param('currency') currency: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    await this.prefs.remove(orgId, user.userId, currency, req.id);
  }
}
