import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Global so any module can call `record()` without listing AuditModule in
 * its imports. The service has a single dependency (PrismaService), which
 * is also global.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
