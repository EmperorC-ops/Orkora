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
  /**
   * Optional second public key used during a JWT signing-key rotation. While
   * set, the API accepts tokens signed by either the current key (verified
   * first) or this previous key, so access tokens minted before the rotation
   * stay valid through the cutover. Operator playbook: bump the active key,
   * paste the old public key here, wait one JWT_ACCESS_TTL window (default
   * 15m), then unset. See DEPLOY.md "Rotating JWT signing keys".
   */
  JWT_PUBLIC_KEY_PREVIOUS: z.string().optional(),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  REFRESH_TOKEN_PEPPER: z.string().min(16),
  TICKET_SIGNING_SECRET: z.string().min(32),
  ORDER_HOLD_TTL_MIN: z.coerce.number().min(1).default(20),

  /**
   * Server-side ceiling on direct-to-S3 uploads. The presign endpoint requires
   * the client to declare sizeBytes in the request, refuses sizes above this
   * limit, and signs the Content-Length as a required header so the resulting
   * URL is single-use for that exact byte count. Defaults to 8 MiB (banners,
   * avatars, logos); raise per-kind if larger media types are added.
   */
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1).default(8 * 1024 * 1024),

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
   * Shared secret for authenticating inbound Postmark webhook POSTs via
   * HTTP Basic Auth. Configure the Postmark webhook URL as
   *   https://postmark:<TOKEN>@api.orkora.events/v1/webhooks/postmark
   * Left optional so existing deployments do not break; when unset the
   * PostmarkAuthGuard warns once and admits (backwards compat). Set this
   * before onboarding real customers to close the forged-bounce vector.
   */
  POSTMARK_WEBHOOK_TOKEN: z.string().optional(),
  /**
   * Per-organisation rolling-24h cap on campaign email recipients.
   * Enforced in CampaignsService.sendNow(). Guards against a "click Send
   * on a 10k audience by mistake" accident. Default 1000. Set higher
   * only for orgs that have proven their sending pattern.
   */
  CAMPAIGNS_DAILY_CAP_PER_ORG: z.coerce.number().int().positive().default(1000),
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

  // Bootstrap for the platform super admin (consumed by the seed:superadmin
  // script). Optional at runtime; only needed when minting the master account.
  SUPERADMIN_EMAIL: z.string().email().optional(),
  SUPERADMIN_NAME: z.string().optional(),

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
