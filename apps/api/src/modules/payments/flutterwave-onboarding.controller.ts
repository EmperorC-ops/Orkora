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
import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FlutterwaveOnboardingService } from './flutterwave-onboarding.service';

class ResolveFlutterwaveAccountDto {
  // Account numbers are digits in most markets, but IBAN-style identifiers are
  // accepted by Flutterwave for SEPA countries, so allow uppercase letters too.
  @IsString()
  @Matches(/^[0-9A-Z]{6,34}$/, {
    message: 'Account number must be 6 to 34 digits or uppercase letters',
  })
  accountNumber!: string;

  @IsString()
  @Length(1, 20)
  bankCode!: string;
}

class ConnectFlutterwaveDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  businessName?: string;

  // Flutterwave requires a primary business contact number on the subaccount.
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Business mobile must be 7 to 15 digits' })
  businessMobile!: string;

  @IsOptional()
  @IsEmail()
  businessEmail?: string;

  @IsString()
  @Length(1, 20)
  bankCode!: string;

  @IsString()
  @Matches(/^[0-9A-Z]{6,34}$/, {
    message: 'Account number must be 6 to 34 digits or uppercase letters',
  })
  accountNumber!: string;

  // ISO-2 country of the settlement bank account. Defaults to NG.
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'Country must be an ISO-2 code' })
  country?: string;
}

@ApiTags('payment-connected-accounts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/payments/accounts/flutterwave')
export class FlutterwaveOnboardingController {
  constructor(private readonly onboarding: FlutterwaveOnboardingService) {}

  @Get('banks')
  @Roles('owner', 'admin')
  banks(@Param('orgId') _orgId: string, @Query('country') country?: string) {
    return this.onboarding.listBanks(country ?? 'NG');
  }

  @Post('resolve')
  @HttpCode(200)
  @Roles('owner', 'admin')
  resolve(@Param('orgId') _orgId: string, @Body() dto: ResolveFlutterwaveAccountDto) {
    return this.onboarding.resolveAccount(dto.accountNumber, dto.bankCode);
  }

  @Post('connect')
  @HttpCode(200)
  @Roles('owner', 'admin')
  connect(
    @Param('orgId') orgId: string,
    @Body() dto: ConnectFlutterwaveDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    return this.onboarding.connect(
      orgId,
      user.userId,
      {
        businessName: dto.businessName,
        businessMobile: dto.businessMobile,
        businessEmail: dto.businessEmail,
        bankCode: dto.bankCode,
        accountNumber: dto.accountNumber,
        country: dto.country,
      },
      req.id,
    );
  }
}
