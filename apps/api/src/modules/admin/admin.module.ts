import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  // PaymentsModule for resolveSettlementHold: the order state machine stays in
  // the payments module, the console only calls it.
  imports: [PaymentsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
