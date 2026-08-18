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
 * Org id resolution is deliberately anchored to the ROUTE PARAM
 * (`:orgId` / `:organizationId`) because that is the value every controller
 * passes down to its service. The `X-Organization-Id` header and a body
 * `organizationId` are only used when no route param is present. If a route
 * param IS present, any supplied header/body org that disagrees with it is
 * rejected: authorizing against a header while the service acts on the path
 * param would let a member of org A operate on org B (cross-tenant BOLA).
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

    const paramOrg = req.params?.orgId ?? req.params?.organizationId;
    const headerOrg = req.headers['x-organization-id'] as string | undefined;
    const bodyOrg = (req.body as { organizationId?: string } | undefined)?.organizationId;

    // Anchor to the route param the service actually uses. Header/body are
    // fallbacks only for routes that carry no org param.
    const orgId = paramOrg ?? headerOrg ?? bodyOrg;

    if (!orgId) {
      throw new ForbiddenException('Organization context is required');
    }

    // When the route names an org, a mismatching header or body org is a
    // tenant-spoofing attempt: reject rather than authorize the wrong org.
    if (paramOrg && headerOrg && headerOrg !== paramOrg) {
      throw new ForbiddenException('Organization context mismatch');
    }
    if (paramOrg && bodyOrg && bodyOrg !== paramOrg) {
      throw new ForbiddenException('Organization context mismatch');
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
