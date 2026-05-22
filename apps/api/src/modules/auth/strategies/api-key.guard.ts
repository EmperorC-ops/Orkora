import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ApiKeysService } from '../../api-keys/api-keys.service';

/**
 * Decorator key carrying the scope a route requires. The ApiKeyGuard
 * enforces that the resolved key has at least one matching scope. JWT
 * callers (full org members) bypass this check because their role hierarchy
 * already dictates what they can see.
 */
export const API_KEY_SCOPES_KEY = 'api_key_scopes';

/**
 * What we attach to the request once an API key resolves. The shape is
 * deliberately distinct from the JWT user shape (which uses `userId`) so
 * downstream code can tell which auth path was taken via `source`.
 */
export interface ApiKeyContext {
  source: 'api-key';
  keyId: string;
  orgId: string;
  scopes: string[];
}

const PREFIX = 'ork_';

/**
 * Guard that authenticates via Authorization: Bearer ork_…
 *
 * Use directly on routes intended for external integrators. Does NOT fall
 * back to JWT — pair with `JwtOrApiKeyGuard` for routes that should accept
 * either a logged-in user or a key holder.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: ApiKeyContext }>();
    const token = extractBearer(req);
    if (!token || !token.startsWith(PREFIX)) {
      throw new UnauthorizedException('API key required');
    }
    const resolved = await this.keys.resolveToken(token);
    if (!resolved) {
      throw new UnauthorizedException('Unknown or revoked API key');
    }

    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      API_KEY_SCOPES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (required && required.length > 0) {
      const has = required.some((s) => resolved.scopes.includes(s));
      if (!has) {
        throw new ForbiddenException(
          `API key missing required scope: ${required.join(' | ')}`,
        );
      }
    }

    req.user = {
      source: 'api-key',
      keyId: resolved.keyId,
      orgId: resolved.orgId,
      scopes: resolved.scopes,
    };
    return true;
  }
}

/**
 * Stub callable shape — the real Passport JWT guard implements this.
 * Keeping it narrow keeps tests trivially small.
 */
export interface CanActivateLike {
  canActivate(ctx: ExecutionContext): boolean | Promise<boolean>;
}

/**
 * Composite guard: accepts either a JWT-authed organizer/staff user or a
 * valid API key. Used on org-scoped read endpoints we want to open to
 * external integrators without doubling up route definitions.
 *
 * Resolution:
 *   - If Authorization is `ork_…`, delegate to ApiKeyGuard. Either it
 *     succeeds (request continues with `req.user.source === 'api-key'`) or
 *     it throws 401/403.
 *   - Otherwise, delegate to AuthGuard('jwt'). Either it verifies the token
 *     (request continues with `req.user.userId` etc.) or it throws 401.
 *
 * Routes that mount this guard SHOULD also mount RolesGuard if they want
 * to enforce a minimum role on the JWT path. ApiKey scope enforcement is
 * handled inline by the inner ApiKeyGuard via `@RequireScope`.
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  // Lazily constructed so tests can stub via setJwtGuard(). In prod we
  // instantiate Passport's AuthGuard('jwt') on first use.
  private jwtGuard: CanActivateLike | null = null;

  constructor(private readonly apiKey: ApiKeyGuard) {}

  /** Test seam. Production code should not call this. */
  setJwtGuard(guard: CanActivateLike): void {
    this.jwtGuard = guard;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = extractBearer(req);
    if (token && token.startsWith(PREFIX)) {
      return this.apiKey.canActivate(ctx);
    }
    if (!this.jwtGuard) {
      // Passport's AuthGuard implements the wider `IAuthGuard` (its
      // canActivate may return an Observable); we only need the narrow
      // CanActivateLike seam, so bridge through `unknown`.
      this.jwtGuard = new (AuthGuard('jwt'))() as unknown as CanActivateLike;
    }
    const guard = this.jwtGuard;
    const result = await guard.canActivate(ctx);
    return Boolean(result);
  }
}

function extractBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ?? null;
}
