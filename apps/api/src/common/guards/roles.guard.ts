import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, type Role } from '../decorators/roles.decorator';

interface JwtMembership {
  orgId: string;
  role: Role;
}

interface RequestUser {
  userId: string;
  email: string;
  platformRole?: string;
  memberships?: JwtMembership[];
}

const HIERARCHY: Record<Role, number> = {
  owner: 5,
  admin: 4,
  organizer: 3,
  staff: 2,
  vendor: 1,
  attendee: 0,
};

/**
 * RolesGuard: requires the JWT to contain a membership for the requested
 * organization with at least the required role's hierarchy level.
 *
 * The org id is resolved from (in order):
 *   1. Route param `:orgId` or `:organizationId`
 *   2. X-Organization-Id header
 *   3. Request body `organizationId`
 *
 * The route param MUST win: controllers pass `@Param('orgId')` to their
 * services, so the guard has to authorize against that exact value. If the
 * header (or body) could override it, a caller who is a member of org A could
 * satisfy the guard with header=A while the route `:orgId`=B makes the
 * controller serve org B's data (cross-tenant IDOR). The header is only used
 * for routes that carry no `:orgId` param at all.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<{
      user?: RequestUser;
      params?: Record<string, string>;
      body?: Record<string, unknown>;
      headers: Record<string, string | string[] | undefined>;
    }>();

    const user = req.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const orgId =
      req.params?.orgId ??
      req.params?.organizationId ??
      (req.headers['x-organization-id'] as string | undefined) ??
      (req.body as { organizationId?: string } | undefined)?.organizationId;

    if (!orgId) {
      throw new ForbiddenException('Organization context is required');
    }

    // Platform super admins have full cross-org control: they satisfy any org
    // role requirement without needing a membership. We attach `owner` as the
    // effective role so downstream interceptors (tenancy, audit) behave as for
    // the highest org role.
    if (user.platformRole === 'superadmin') {
      (req.user as RequestUser & { activeOrgId?: string; activeRole?: Role }).activeOrgId = orgId;
      (req.user as RequestUser & { activeOrgId?: string; activeRole?: Role }).activeRole = 'owner';
      return true;
    }

    const membership = user.memberships?.find((m) => m.orgId === orgId);
    if (!membership) throw new ForbiddenException('You are not a member of this organization');

    const userLevel = HIERARCHY[membership.role] ?? -1;
    const minRequired = Math.min(...required.map((r) => HIERARCHY[r]));
    if (userLevel < minRequired) {
      throw new ForbiddenException('Insufficient role for this action');
    }

    // Attach for downstream interceptors (tenancy, audit log).
    (req.user as RequestUser & { activeOrgId?: string; activeRole?: Role }).activeOrgId = orgId;
    (req.user as RequestUser & { activeOrgId?: string; activeRole?: Role }).activeRole =
      membership.role;
    return true;
  }
}
