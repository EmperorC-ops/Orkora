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
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ConnectedAccountsService } from './connected-accounts.service';

class RecordAccountDto {
  @IsString()
  @IsIn(['stripe', 'paystack', 'flutterwave'])
  provider!: 'stripe' | 'paystack' | 'flutterwave';

  // Provider account reference: Stripe connected account id, Paystack subaccount
  // code, or Flutterwave subaccount id.
  @IsString()
  @Length(1, 200)
  accountRef!: string;

  // Defaults to true: the account is asserted ready to receive a split.
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

@ApiTags('payment-connected-accounts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/payments/accounts')
export class ConnectedAccountsController {
  constructor(private readonly accounts: ConnectedAccountsService) {}

  @Get()
  @Roles('staff')
  list(@Param('orgId') orgId: string) {
    return this.accounts.list(orgId);
  }

  @Post()
  @HttpCode(200)
  @Roles('owner', 'admin')
  record(
    @Param('orgId') orgId: string,
    @Body() dto: RecordAccountDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    return this.accounts.record(
      orgId,
      user.userId,
      { provider: dto.provider, accountRef: dto.accountRef, active: dto.active },
      req.id,
    );
  }

  @Delete(':provider')
  @HttpCode(204)
  @Roles('owner', 'admin')
  async disconnect(
    @Param('orgId') orgId: string,
    @Param('provider') provider: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    await this.accounts.disconnect(orgId, user.userId, provider, req.id);
  }
}
