import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminDeletionService } from './admin-deletion.service';

@Module({
  // PaymentsModule for resolveSettlementHold: the order state machine stays in
  // the payments module, the console only calls it.
  imports: [PaymentsModule],
  controllers: [AdminController],
  // AuditService (used by AdminDeletionService) comes from the global AuditModule.
  providers: [AdminService, AdminDeletionService],
})
export class AdminModule {}
