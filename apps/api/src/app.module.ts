import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { stdSerializers } from 'pino';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Ticket codes and VIP tokens are long-lived bearer credentials that ride in
 * request URLs (`/v1/tickets/<code>`, `/v1/tickets/<code>/share`, and the
 * `?t=<token>` on the VIP context endpoint). Access logs would otherwise record
 * them verbatim, leaving a reusable credential sitting in log storage. This
 * masks those values before the request line is logged. It only touches the
 * logged copy of the URL; routing and handlers still see the real value.
 */
export function scrubCredentialUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return (
    url
      // Path-borne ticket code: /tickets/<code> and /tickets/<code>/share etc.
      .replace(/(\/tickets\/)[^/?#]+/gi, '$1[redacted]')
      // Credential-bearing query params: the VIP/ticket token `t` and `code`.
      .replace(/([?&](?:t|code)=)[^&#]*/gi, '$1[redacted]')
  );
}
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
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { DiscountsModule } from './modules/discounts/discounts.module';
import { RecordingsModule } from './modules/recordings/recordings.module';
import { BillingModule } from './modules/billing/billing.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AdminModule } from './modules/admin/admin.module';

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
        // Mask ticket codes / VIP tokens carried in request URLs so they are
        // not written to access logs. Wraps pino's standard req serializer and
        // only rewrites the logged `url` string.
        serializers: {
          req: stdSerializers.wrapRequestSerializer((req) => {
            req.url = scrubCredentialUrl(req.url);
            return req;
          }),
        },
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
        customProps: (req: IncomingMessage) => ({
          requestId: String((req as IncomingMessage & { id?: unknown }).id ?? ''),
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
    CampaignsModule,
    FeedbackModule,
    DiscountsModule,
    RecordingsModule,
    BillingModule,
    AnalyticsModule,
    AuditModule,
    ApiKeysModule,
    ReportsModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
export class AppModule {}
