import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export type Role = 'owner' | 'admin' | 'organizer' | 'staff' | 'vendor' | 'attendee';

/**
 * Annotate a controller or handler with one or more allowed roles. The
 * RolesGuard will check the JWT memberships array against the request's
 * organization context (param `orgId` or X-Organization-Id header).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
