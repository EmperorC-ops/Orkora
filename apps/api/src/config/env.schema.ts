import { z } from 'zod';

/**
 * Single source of truth for environment variables.
 * The API refuses to boot if anything required is missing.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  CORS_ORIGINS: z.string().optional(),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  REFRESH_TOKEN_PEPPER: z.string().min(16),
  TICKET_SIGNING_SECRET: z.string().min(32),
  ORDER_HOLD_TTL_MIN: z.coerce.number().min(1).default(20),

  AWS_REGION: z.string().default('eu-west-1'),
  S3_BUCKET_MEDIA: z.string().optional(),
  S3_BUCKET_EXPORTS: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  POSTMARK_TOKEN: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
  /**
   * When true, OTP codes are logged at WARN level so they can be retrieved
   * from server logs. Use only when email delivery is unavailable (e.g. a
   * provider is in review). Never enable in real production traffic.
   */
  LOG_OTP_TO_CONSOLE: z.coerce.boolean().default(false),
  TERMII_API_KEY: z.string().optional(),
  TWILIO_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),

  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  APPLE_OAUTH_CLIENT_ID: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
  FLUTTERWAVE_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_WEBHOOK_SECRET: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment variables:');
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Environment validation failed. See log above.');
  }
  return parsed.data;
}
