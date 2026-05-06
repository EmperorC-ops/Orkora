import { SetMetadata } from '@nestjs/common';
import { API_KEY_SCOPES_KEY } from './api-key.guard';

/**
 * Mark a route as requiring at least one of the listed API key scopes.
 * Has no effect on JWT-authed callers (their role hierarchy still applies).
 *
 * Example:
 *   @UseGuards(ApiKeyGuard)
 *   @RequireScope('events.read', 'analytics.read')
 *   @Get('public/events')
 *   listEvents() { ... }
 */
export const RequireScope = (...scopes: string[]) =>
  SetMetadata(API_KEY_SCOPES_KEY, scopes);
