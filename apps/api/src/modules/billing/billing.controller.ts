import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BillingService } from './billing.service';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('overview')
  @Roles('owner', 'admin', 'organizer')
  overview(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.billing.overview(orgId);
  }

  @Get('trailing-12')
  @Roles('owner', 'admin', 'organizer')
  trailing12(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.billing.trailing12(orgId);
  }

  @Get('orders.csv')
  @Roles('owner', 'admin')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="orkora-orders.csv"')
  async exportCsv(@Param('orgId', ParseUUIDPipe) orgId: string, @Res() res: Response) {
    const csv = await this.billing.exportOrdersCsv(orgId);
    res.send(csv);
  }
}
