import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import type { Role } from '../decorators/roles.decorator';

/**
 * Tenancy contract tests for RolesGuard. This guard is the single point that
 * authorizes a caller against an organization, so these tests pin the rules
 * that keep one org from acting on another:
 *   - a caller may only act on an org they hold a membership for
 *   - the membership role must meet the required hierarchy level
 *   - platform superadmin is the ONLY cross-org bypass
 *   - org id is resolved from header -> param -> body
 */

type ReqUser = {
  userId: string;
  email: string;
  platformRole?: string;
  memberships?: Array<{ orgId: string; role: Role }>;
};

type FakeReq = {
  user?: ReqUser;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
};

function makeCtx(req: FakeReq): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class Dummy {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeGuard(required: Role[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

describe('RolesGuard tenancy contract', () => {
  it('allows any request when no roles are required (unguarded route)', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(makeCtx({ headers: {} }))).toBe(true);
  });

  it('rejects an unauthenticated request', () => {
    const guard = makeGuard(['staff']);
    expect(() => guard.canActivate(makeCtx({ headers: {} }))).toThrow(ForbiddenException);
  });

  it('rejects when no organization context is provided', () => {
    const guard = makeGuard(['staff']);
    const req: FakeReq = {
      user: { userId: 'u1', email: 'a@b.co', memberships: [{ orgId: ORG_A, role: 'owner' }] },
      headers: {},
    };
    expect(() => guard.canActivate(makeCtx(req))).toThrow('Organization context is required');
  });

  it('DENIES a member of org A acting on org B (cross-tenant)', () => {
    const guard = makeGuard(['staff']);
    const req: FakeReq = {
      user: { userId: 'u1', email: 'a@b.co', memberships: [{ orgId: ORG_A, role: 'owner' }] },
      headers: { 'x-organization-id': ORG_B },
    };
    expect(() => guard.canActivate(makeCtx(req))).toThrow('You are not a member of this organization');
  });

  it('allows a member acting on their own org and attaches activeOrgId/activeRole', () => {
    const guard = makeGuard(['staff']);
    const req: FakeReq = {
      user: { userId: 'u1', email: 'a@b.co', memberships: [{ orgId: ORG_A, role: 'organizer' }] },
      headers: { 'x-organization-id': ORG_A },
    };
    expect(guard.canActivate(makeCtx(req))).toBe(true);
    expect((req.user as { activeOrgId?: string }).activeOrgId).toBe(ORG_A);
    expect((req.user as { activeRole?: string }).activeRole).toBe('organizer');
  });

  it('enforces role hierarchy: a staff member cannot perform an admin-required action', () => {
    const guard = makeGuard(['admin']);
    const req: FakeReq = {
      user: { userId: 'u1', email: 'a@b.co', memberships: [{ orgId: ORG_A, role: 'staff' }] },
      headers: { 'x-organization-id': ORG_A },
    };
    expect(() => guard.canActivate(makeCtx(req))).toThrow('Insufficient role for this action');
  });

  it('allows a higher role to satisfy a lower requirement', () => {
    const guard = makeGuard(['organizer']);
    const req: FakeReq = {
      user: { userId: 'u1', email: 'a@b.co', memberships: [{ orgId: ORG_A, role: 'owner' }] },
      headers: { 'x-organization-id': ORG_A },
    };
    expect(guard.canActivate(makeCtx(req))).toBe(true);
  });

  it('lets a platform superadmin act on ANY org without a membership (sole cross-org bypass)', () => {
    const guard = makeGuard(['owner']);
    const req: FakeReq = {
      user: { userId: 'root', email: 'admin@orkora.events', platformRole: 'superadmin', memberships: [] },
      headers: { 'x-organization-id': ORG_B },
    };
    expect(guard.canActivate(makeCtx(req))).toBe(true);
    expect((req.user as { activeOrgId?: string }).activeOrgId).toBe(ORG_B);
    expect((req.user as { activeRole?: string }).activeRole).toBe('owner');
  });

  it('does NOT treat platformRole "support" or "none" as a cross-org bypass', () => {
    for (const platformRole of ['support', 'none', undefined]) {
      const guard = makeGuard(['staff']);
      const req: FakeReq = {
        user: { userId: 'u1', email: 'a@b.co', platformRole, memberships: [{ orgId: ORG_A, role: 'owner' }] },
        headers: { 'x-organization-id': ORG_B },
      };
      expect(() => guard.canActivate(makeCtx(req))).toThrow(ForbiddenException);
    }
  });

  it('resolves org id from the route param when no header is present', () => {
    const guard = makeGuard(['staff']);
    const req: FakeReq = {
      user: { userId: 'u1', email: 'a@b.co', memberships: [{ orgId: ORG_A, role: 'staff' }] },
      params: { orgId: ORG_A },
      headers: {},
    };
    expect(guard.canActivate(makeCtx(req))).toBe(true);
  });

  it('resolves org id from the request body as a last resort', () => {
    const guard = makeGuard(['staff']);
    const req: FakeReq = {
      user: { userId: 'u1', email: 'a@b.co', memberships: [{ orgId: ORG_A, role: 'staff' }] },
      body: { organizationId: ORG_A },
      headers: {},
    };
    expect(guard.canActivate(makeCtx(req))).toBe(true);
  });

  it('header org id takes precedence and is the one authorized', () => {
    // User is a member of A only. Header says B, param says A. The guard must
    // authorize against the header (B) and therefore deny.
    const guard = makeGuard(['staff']);
    const req: FakeReq = {
      user: { userId: 'u1', email: 'a@b.co', memberships: [{ orgId: ORG_A, role: 'owner' }] },
      params: { orgId: ORG_A },
      headers: { 'x-organization-id': ORG_B },
    };
    expect(() => guard.canActivate(makeCtx(req))).toThrow(ForbiddenException);
  });
});
