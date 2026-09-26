import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaystackOnboardingService } from './paystack-onboarding.service';

class ResolveAccountDto {
  @IsString()
  @Matches(/^[0-9]{6,20}$/, { message: 'Account number must be 6 to 20 digits' })
  accountNumber!: string;

  @IsString()
  @Length(1, 20)
  bankCode!: string;
}

class ConnectPaystackDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  businessName?: string;

  @IsString()
  @Length(1, 20)
  bankCode!: string;

  @IsString()
  @Matches(/^[0-9]{6,20}$/, { message: 'Account number must be 6 to 20 digits' })
  accountNumber!: string;
}

@ApiTags('payment-connected-accounts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/payments/accounts/paystack')
export class PaystackOnboardingController {
  constructor(private readonly onboarding: PaystackOnboardingService) {}

  @Get('banks')
  @Roles('owner', 'admin')
  banks(@Param('orgId') _orgId: string, @Query('currency') currency?: string) {
    return this.onboarding.listBanks(currency ?? 'NGN');
  }

  @Post('resolve')
  @HttpCode(200)
  @Roles('owner', 'admin')
  resolve(@Param('orgId') _orgId: string, @Body() dto: ResolveAccountDto) {
    return this.onboarding.resolveAccount(dto.accountNumber, dto.bankCode);
  }

  @Post('connect')
  @HttpCode(200)
  @Roles('owner', 'admin')
  connect(
    @Param('orgId') orgId: string,
    @Body() dto: ConnectPaystackDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    return this.onboarding.connect(
      orgId,
      user.userId,
      { businessName: dto.businessName, bankCode: dto.bankCode, accountNumber: dto.accountNumber },
      req.id,
    );
  }
}
