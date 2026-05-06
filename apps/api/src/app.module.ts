import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { validateEnv } from './config/env.schema';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { PrismaModule } from './database/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrgsModule } from './modules/orgs/orgs.module';
import { EventsModule } from './modules/events/events.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { InvitesModule } from './modules/invites/invites.module';
import { RegistrationsModule } from './modules/registrations/registrations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
        // Per-request correlation id. Honours an inbound `X-Request-Id` from
        // an upstream proxy or client, otherwise mints a fresh UUID. Echoed
        // back as `X-Request-Id` so logs and client traces line up.
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const incoming = req.headers['x-request-id'];
          const id =
            (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
          res.setHeader('X-Request-Id', id);
          return id;
        },
        customProps: (req: IncomingMessage & { id?: string }) => ({
          requestId: req.id,
        }),
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    HealthModule,
    NotificationsModule,
    AuthModule,
    OrgsModule,
    EventsModule,
    InvitesModule,
    RegistrationsModule,
    PaymentsModule,
    UploadsModule,
    EngagementModule,
    AnalyticsModule,
    AuditModule,
    ApiKeysModule,
    ReportsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
export class AppModule {}
