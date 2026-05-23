import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLATFORM_ROLES_KEY, type PlatformRole } from '../decorators/platform.decorator';

interface RequestUser {
  userId: string;
  email: string;
  platformRole?: string;
}

/**
 * Gate platform-console routes by the JWT `platformRole` claim. A super admin
 * satisfies every requirement; support staff satisfy only routes that
 * explicitly allow 'support'. Routes with no `@PlatformRoles()` metadata
 * default to super-admin-only.
 *
 * Pair with `AuthGuard('jwt')` so `req.user` is populated first.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PlatformRole[] | undefined>(
      PLATFORM_ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    const allowed: PlatformRole[] = required && required.length ? required : ['superadmin'];

    const req = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const role = user.platformRole ?? 'none';
    if (role === 'superadmin') return true;
    if (allowed.includes(role as PlatformRole)) return true;
    throw new ForbiddenException('Platform administrator access required');
  }
}
