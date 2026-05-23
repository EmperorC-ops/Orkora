import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ROLES_KEY = 'platform_roles';

export type PlatformRole = 'superadmin' | 'support';

/**
 * Restrict a route to Orkora platform staff. With no arguments it requires a
 * super admin. Pass 'support' to also allow read-only platform support staff.
 * Enforced by `PlatformGuard` against the JWT's `platformRole` claim. This is a
 * separate axis from the per-org `@Roles()` decorator.
 */
export const PlatformRoles = (...roles: PlatformRole[]) =>
  SetMetadata(PLATFORM_ROLES_KEY, roles.length ? roles : ['superadmin']);

/** Convenience: super-admin-only. */
export const SuperAdmin = () => PlatformRoles('superadmin');
