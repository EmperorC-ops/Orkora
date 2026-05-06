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
      // Safe because orgId comes from the verified JWT, not user input.
      await this.prisma.$executeRawUnsafe(`SET LOCAL app.org_id = '${orgId}'`);
    }
    return next.handle();
  }
}
