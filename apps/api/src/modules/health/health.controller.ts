import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness: is the process up and serving HTTP? Deliberately has NO external
   * dependency, so a database blip can never trip the container/orchestrator
   * healthcheck into a restart loop (restarting won't fix the DB). This is the
   * URL the Docker HEALTHCHECK and Render's service health should use.
   */
  @Get()
  @HttpCode(200)
  live() {
    return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() };
  }

  /**
   * Readiness: can the app actually serve real traffic right now (database
   * reachable)? Returns 503 when a dependency is down, so an external uptime
   * monitor (UptimeRobot / BetterStack) alerts on a real outage instead of
   * seeing a misleading 200. Point the dependency monitor here.
   */
  @Get('ready')
  async ready() {
    const [db] = await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`]);
    const databaseOk = db.status === 'fulfilled';
    const body = {
      status: databaseOk ? 'ok' : 'degraded',
      checks: { database: databaseOk ? 'ok' : 'down' },
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
