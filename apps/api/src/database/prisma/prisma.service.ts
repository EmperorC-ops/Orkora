import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma connects lazily on the first query. We deliberately do NOT call
 * `$connect()` at startup: on Render this process runs 24/7, and an eagerly
 * opened session against Neon is one more reason for its compute never to
 * suspend. The first request after an idle period pays a few hundred
 * milliseconds for the compute to wake, which is the intended trade.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}
