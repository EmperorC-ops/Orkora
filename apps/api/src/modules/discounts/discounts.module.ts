import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import {
  DiscountsController,
  DiscountsPublicController,
} from './discounts.controller';
import { DiscountsService } from './discounts.service';

@Module({
  imports: [PrismaModule],
  controllers: [DiscountsPublicController, DiscountsController],
  providers: [DiscountsService],
  exports: [DiscountsService],
})
export class DiscountsModule {}
