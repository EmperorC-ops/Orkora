import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../database/prisma/prisma.service';

/**
 * Sets the PostgreSQL session variable app.org_id for the duration of the request,
 * so RLS policies can enforce tenant isolation at the database layer.
 *
 * Wire this on any controller or route that reads/writes tenant scoped data.
 */
@Injectable()
export class TenancyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest<{ user?: { orgId?: string } }>();
    const orgId = req.user?.orgId;
    if (orgId) {
      // Use set_config() with a bound parameter rather than `SET LOCAL ...` with
      // string interpolation. orgId already comes from a verified JWT (so it is
      // not attacker-controlled), but defense-in-depth: parameterized binding
      // means no future refactor can accidentally introduce SQL injection here.
      await this.prisma.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
    }
    return next.handle();
  }
}
