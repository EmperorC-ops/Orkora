import { Reflector } from '@nestjs/core';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import {
  ApiKeyGuard,
  JwtOrApiKeyGuard,
  API_KEY_SCOPES_KEY,
} from './api-key.guard';
import { ApiKeysService } from '../../api-keys/api-keys.service';

/**
 * Tests for the ApiKey + composite guards. Reflector is real (cheap to
 * construct); ApiKeysService is stubbed since `resolveToken` is the only
 * surface we exercise here. The composite's JWT path is stubbed via
 * `setJwtGuard()` so we don't drag Passport into the test runtime.
 */

function makeCtx(headers: Record<string, string>, scopes?: string[]): ExecutionContext {
  const req = { headers } as { headers: Record<string, string>; user?: unknown };
  const handler = scopes
    ? Object.assign(() => undefined, { [API_KEY_SCOPES_KEY]: scopes })
    : () => undefined;
  if (scopes) Reflect.defineMetadata(API_KEY_SCOPES_KEY, scopes, handler);
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    getHandler: () => handler,
    getClass: () => class Stub {},
  } as unknown as ExecutionContext;
}

function makeKeysService(resolveResult: Awaited<ReturnType<ApiKeysService['resolveToken']>>) {
  return {
    resolveToken: jest.fn().mockResolvedValue(resolveResult),
  } as unknown as ApiKeysService;
}

describe('ApiKeyGuard', () => {
  const reflector = new Reflector();

  it('throws 401 when there is no Authorization header', async () => {
    const guard = new ApiKeyGuard(makeKeysService(null), reflector);
    await expect(guard.canActivate(makeCtx({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws 401 when the token does not start with ork_', async () => {
    const guard = new ApiKeyGuard(makeKeysService(null), reflector);
    await expect(
      guard.canActivate(makeCtx({ authorization: 'Bearer eyJhbGc.foo.bar' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws 401 when the token is unknown / revoked', async () => {
    const guard = new ApiKeyGuard(makeKeysService(null), reflector);
    await expect(
      guard.canActivate(makeCtx({ authorization: 'Bearer ork_abcdef' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws 403 when scopes do not match', async () => {
    const keys = makeKeysService({
      orgId: 'org-1',
      keyId: 'k1',
      scopes: ['events.read'],
    });
    const guard = new ApiKeyGuard(keys, reflector);
    await expect(
      guard.canActivate(
        makeCtx({ authorization: 'Bearer ork_abcdef' }, ['analytics.read']),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes when at least one required scope is satisfied', async () => {
    const keys = makeKeysService({
      orgId: 'org-1',
      keyId: 'k1',
      scopes: ['events.read', 'registrations.read'],
    });
    const guard = new ApiKeyGuard(keys, reflector);
    const ctx = makeCtx({ authorization: 'Bearer ork_abcdef' }, [
      'analytics.read',
      'events.read',
    ]);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const req = ctx.switchToHttp().getRequest();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((req as any).user).toEqual({
      source: 'api-key',
      keyId: 'k1',
      orgId: 'org-1',
      scopes: ['events.read', 'registrations.read'],
    });
  });
});

describe('JwtOrApiKeyGuard', () => {
  const reflector = new Reflector();

  it('routes to JWT when there is no token', async () => {
    const apiKey = new ApiKeyGuard(makeKeysService(null), reflector);
    const guard = new JwtOrApiKeyGuard(apiKey);
    const jwt = { canActivate: jest.fn().mockReturnValue(true) };
    guard.setJwtGuard(jwt);
    const ctx = makeCtx({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(jwt.canActivate).toHaveBeenCalled();
  });

  it('routes to JWT when the token is not an ork_ prefix', async () => {
    const apiKey = new ApiKeyGuard(makeKeysService(null), reflector);
    const guard = new JwtOrApiKeyGuard(apiKey);
    const jwt = { canActivate: jest.fn().mockReturnValue(true) };
    guard.setJwtGuard(jwt);
    const ctx = makeCtx({ authorization: 'Bearer eyJhbGc.x.y' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(jwt.canActivate).toHaveBeenCalled();
  });

  it('routes through ApiKeyGuard when the token is ork_…', async () => {
    const keys = makeKeysService({
      orgId: 'org-1',
      keyId: 'k1',
      scopes: ['events.read'],
    });
    const apiKey = new ApiKeyGuard(keys, reflector);
    const guard = new JwtOrApiKeyGuard(apiKey);
    const jwt = { canActivate: jest.fn().mockReturnValue(true) };
    guard.setJwtGuard(jwt);
    const ctx = makeCtx({ authorization: 'Bearer ork_xyz' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(jwt.canActivate).not.toHaveBeenCalled();
  });
});
