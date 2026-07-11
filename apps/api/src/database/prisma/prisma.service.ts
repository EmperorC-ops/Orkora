import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Connection pool sizing (before the first horizontal scale): Prisma reads the
 * pool from the `DATABASE_URL` query string, so set it there rather than in code
 * because the right value is topology-dependent -
 * `?connection_limit=<N>&pool_timeout=<seconds>`. Keep
 * `instances * connection_limit` comfortably under the database's
 * `max_connections` (on pooled Postgres like PgBouncer/Neon, size against the
 * pooler's limit and prefer the transaction pooler). Left unset here so the
 * default (`num_cpus * 2 + 1` per instance) applies until a real number is
 * chosen for the deploy.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
