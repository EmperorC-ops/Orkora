import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { corsOrigins } from './common/cors-origins';

// Sentry must be initialised before the Nest app is created so its
// instrumentation can wrap the runtime. Disabled when SENTRY_DSN is unset
// (common in dev), in which case Sentry calls are no-ops.
//
// `release` groups issues by deploy. We accept any of the three common env
// vars (Render, Vercel, plain SENTRY_RELEASE) so the same code works on
// every platform we deploy to without further wiring.
if (process.env.SENTRY_DSN) {
  const release =
    process.env.SENTRY_RELEASE ??
    process.env.RENDER_GIT_COMMIT ??
    process.env.VERCEL_GIT_COMMIT_SHA;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    ...(release ? { release } : {}),
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    cors: {
      // Locked to an explicit allow-list (see corsOrigins). The WS gateway
      // reuses the same helper so both surfaces honour one CORS_ORIGINS var.
      origin: corsOrigins(),
      credentials: true,
    },
    // Capture the raw request body alongside the JSON-parsed body. The
    // payments webhook handler needs the raw bytes for HMAC signature
    // verification (Stripe, Paystack, Flutterwave all require this).
    rawBody: true,
  });

  app.useLogger(app.get(Logger));

  // Helmet ships sensible defaults; we tighten CSP and turn on HSTS in
  // production. The API is JSON-only so it does not need a permissive CSP;
  // the strict default ('self') is fine since we never embed scripts.
  // CSP violations from any of our front-ends post here so we can spot
  // regressions after a deploy without leaving the Sentry dashboard.
  const cspReportUri = process.env.CSP_REPORT_URI ?? '/v1/csp-reports';
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          reportUri: [cspReportUri],
        },
      },
      // HSTS is only meaningful over HTTPS. Render terminates TLS at the
      // edge so the upstream sees plain HTTP; we still emit HSTS so any
      // direct exposure is covered.
      strictTransportSecurity:
        process.env.NODE_ENV === 'production'
          ? { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: true }
          : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(cookieParser());
  app.enableShutdownHooks();

  // Liveness (/health) and readiness (/health/ready) stay unprefixed so the
  // container healthcheck and external uptime monitors hit stable URLs.
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready', 'metrics'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      // forbidUnknownValues ensures DTOs fail closed if the validator
      // metadata is missing entirely (e.g. a misimported class). Combined
      // with whitelist + forbidNonWhitelisted this means every payload must
      // match a class-validator schema or it is rejected at the boundary.
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Orkora API')
      .setDescription('Event management platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, doc);
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Orkora API listening on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
