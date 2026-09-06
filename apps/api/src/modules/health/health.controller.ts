import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

/**
 * How often /health/ready is allowed to actually touch the database. Neon
 * suspends its compute after 5 idle minutes, and an uptime monitor polling this
 * route every 5 minutes re-woke it every time, which kept the database billing
 * 24 hours a day (measured Aug 2026: ~186 CU-hours, about $19/month, for an API
 * with no traffic). One real probe an hour bounds that at ~$1.50/month while
 * still catching a dead database within the hour. Override with
 * READY_PROBE_INTERVAL_MS (set to 0 to probe on every call).
 */
const DEFAULT_PROBE_INTERVAL_MS = 60 * 60 * 1000;

@Controller('health')
export class HealthController {
  private lastProbeAt = 0;
  private lastProbeOk = false;

  constructor(private readonly prisma: PrismaService) {}

  private probeIntervalMs(): number {
    const raw = process.env.READY_PROBE_INTERVAL_MS;
    if (raw === undefined || raw === '') return DEFAULT_PROBE_INTERVAL_MS;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_PROBE_INTERVAL_MS;
  }

  /**
   * Liveness: is the process up and serving HTTP? Deliberately has NO external
   * dependency, so a database blip can never trip the container/orchestrator
   * healthcheck into a restart loop (restarting won't fix the DB). This is the
   * URL the Docker HEALTHCHECK, Render's service health AND any external uptime
   * monitor should use.
   */
  @Get()
  @HttpCode(200)
  live() {
    return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() };
  }

  /**
   * Readiness: can the app actually serve real traffic right now (database
   * reachable)? Returns 503 when a dependency is down.
   *
   * The database is probed at most once per READY_PROBE_INTERVAL_MS; calls in
   * between return the last verdict with `checks.database` = "ok (cached)".
   * A failed probe is never cached, so once the database is down every call
   * re-checks until it recovers. This keeps the route honest for deploy gates
   * and humans without letting a frequent poller keep Neon awake.
   */
  @Get('ready')
  async ready() {
    const now = Date.now();
    const interval = this.probeIntervalMs();
    const cacheable = this.lastProbeOk && now - this.lastProbeAt < interval;

    let databaseOk: boolean;
    let cached = false;
    if (cacheable) {
      databaseOk = true;
      cached = true;
    } else {
      const [db] = await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`]);
      databaseOk = db.status === 'fulfilled';
      this.lastProbeAt = now;
      this.lastProbeOk = databaseOk;
    }

    const body = {
      status: databaseOk ? 'ok' : 'degraded',
      checks: { database: databaseOk ? (cached ? 'ok (cached)' : 'ok') : 'down' },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
    if (!databaseOk) throw new ServiceUnavailableException(body);
    return body;
  }

  /**
   * Deliberate error to verify Sentry capture end-to-end (the global filter
   * reports 5xx to Sentry). Inert by default: returns 404 unless
   * ENABLE_DEBUG_ROUTES=true, so it is safe to ship. To verify: set the flag on
   * the target service, GET this once, confirm the event appears in Sentry,
   * then turn the flag off. Prefixed at /v1/health/debug-sentry.
   */
  @Get('debug-sentry')
  debugSentry(): never {
    if (process.env.ENABLE_DEBUG_ROUTES !== 'true') {
      throw new NotFoundException();
    }
    throw new Error('Sentry test error from /v1/health/debug-sentry (deliberate)');
  }
}
