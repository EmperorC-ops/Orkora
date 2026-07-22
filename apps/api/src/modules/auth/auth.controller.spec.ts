import { ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import type { AuthService, SignupRequestResult } from './auth.service';
import type { OtpService } from './otp.service';

/**
 * Tests for the cookie-based refresh CSRF guard and the non-enumerating
 * signup endpoint. The full auth-service signupRequest behaviour is
 * covered in auth.signup.spec.ts; this file proves only the HTTP-layer
 * surface (CSRF check + signup pass-through + correct shape).
 */

const okBundle = { accessToken: 'a', refreshToken: 'r', expiresIn: 900 };
const okSignup: SignupRequestResult = {
  status: 'verification_sent',
  destination: 'a@example.com',
};

function makeController(overrides?: {
  refresh?: AuthService['refresh'];
  signupRequest?: AuthService['signupRequest'];
}): { ctrl: AuthController; refresh: jest.Mock; signupRequest: jest.Mock } {
  const refresh = (overrides?.refresh as unknown as jest.Mock) ??
    (jest.fn().mockResolvedValue(okBundle) as unknown as jest.Mock);
  const signupRequest = (overrides?.signupRequest as unknown as jest.Mock) ??
    (jest.fn().mockResolvedValue(okSignup) as unknown as jest.Mock);
  const auth = { refresh, signupRequest };
  const otp = { send: jest.fn(), verify: jest.fn() };
  const ctrl = new AuthController(
    auth as unknown as AuthService,
    otp as unknown as OtpService,
  );
  return { ctrl, refresh, signupRequest };
}

function makeRes() {
  const cookies: Record<string, string> = {};
  return {
    cookies,
    cookie: jest.fn((k: string, v: string) => {
      cookies[k] = v;
    }),
    clearCookie: jest.fn(),
    status: jest.fn().mockReturnThis(),
  } as unknown as Parameters<AuthController['refresh']>[2];
}

function makeReq(opts: {
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}): Parameters<AuthController['refresh']>[1] {
  const headers = opts.headers ?? {};
  return {
    cookies: opts.cookies ?? {},
    headers,
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Parameters<AuthController['refresh']>[1];
}

describe('AuthController.refresh CSRF', () => {
  it('rejects a cookie-bearing request that does not echo the CSRF cookie value as X-CSRF-Token', async () => {
    const { ctrl, refresh } = makeController();
    const req = makeReq({ cookies: { orkora_rt: 'good-token', orkora_csrf: 'TOKEN-A' } });
    await expect(ctrl.refresh(undefined, req, makeRes())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rejects when the CSRF cookie is missing entirely', async () => {
    const { ctrl } = makeController();
    const req = makeReq({
      cookies: { orkora_rt: 'good-token' },
      headers: { 'x-csrf-token': 'anything' },
    });
    await expect(ctrl.refresh(undefined, req, makeRes())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects when the header value differs from the cookie value', async () => {
    const { ctrl } = makeController();
    const req = makeReq({
      cookies: { orkora_rt: 'good-token', orkora_csrf: 'TOKEN-A' },
      headers: { 'x-csrf-token': 'TOKEN-B' },
    });
    await expect(ctrl.refresh(undefined, req, makeRes())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('accepts when cookie and header match', async () => {
    const { ctrl, refresh } = makeController();
    const req = makeReq({
      cookies: { orkora_rt: 'good-token', orkora_csrf: 'TOKEN-A' },
      headers: { 'x-csrf-token': 'TOKEN-A' },
    });
    const out = await ctrl.refresh(undefined, req, makeRes());
    expect(refresh).toHaveBeenCalledWith('good-token');
    expect(out).toEqual(expect.objectContaining({ accessToken: expect.any(String) }));
  });

  it('skips the CSRF check when the refresh token came from the request body (mobile path)', async () => {
    const { ctrl, refresh } = makeController();
    const req = makeReq({ cookies: {} });
    const out = await ctrl.refresh(
      { refreshToken: 'mobile-token' },
      req,
      makeRes(),
    );
    expect(refresh).toHaveBeenCalledWith('mobile-token');
    expect(out).toBeDefined();
  });

  it('returns 401 envelope when neither cookie nor body provides a token', async () => {
    const { ctrl, refresh } = makeController();
    const req = makeReq({ cookies: {} });
    const res = makeRes();
    const out = await ctrl.refresh(undefined, req, res);
    expect(refresh).not.toHaveBeenCalled();
    expect((res as unknown as { status: jest.Mock }).status).toHaveBeenCalledWith(401);
    expect(out).toEqual({ message: 'No refresh token' });
  });

  // Regression lock for the "signup works in incognito but not a regular
  // browser" incident. The CSRF companion cookie MUST be set at Path=/ (so the
  // web app running at /dashboard etc. can read it via document.cookie) and
  // scoped to the shared registrable domain (so a www/apex web host can read a
  // cookie set by the api host). If either regresses, the double-submit
  // refresh silently breaks for every returning visitor.
  it('sets the CSRF cookie at Path=/ and the domain from COOKIE_DOMAIN', async () => {
    const prev = process.env.COOKIE_DOMAIN;
    process.env.COOKIE_DOMAIN = '.orkora.events';
    jest.resetModules();
    // Re-import the controller so the module-level COOKIE_DOMAIN constant is
    // recomputed from the env we just set.
    const { AuthController: FreshController } = await import('./auth.controller');
    const authMock = { refresh: jest.fn().mockResolvedValue(okBundle) };
    const otpMock = { send: jest.fn(), verify: jest.fn() };
    const ctrl = new FreshController(
      authMock as unknown as AuthService,
      otpMock as unknown as OtpService,
    );
    const calls: Array<{ name: string; opts: Record<string, unknown> }> = [];
    const res = {
      cookies: {} as Record<string, string>,
      cookie: jest.fn((name: string, _v: string, opts: Record<string, unknown>) => {
        calls.push({ name, opts });
      }),
      clearCookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as unknown as Parameters<AuthController['refresh']>[2];
    const req = makeReq({
      cookies: { orkora_rt: 'good-token', orkora_csrf: 'TOKEN-A' },
      headers: { 'x-csrf-token': 'TOKEN-A' },
    });
    await ctrl.refresh(undefined, req, res);

    const csrfSet = calls.find((c) => c.name === 'orkora_csrf');
    const refreshSet = calls.find((c) => c.name === 'orkora_rt');
    expect(csrfSet?.opts.path).toBe('/');
    expect(csrfSet?.opts.domain).toBe('.orkora.events');
    expect(csrfSet?.opts.httpOnly).toBe(false);
    expect(refreshSet?.opts.path).toBe('/v1/auth');
    expect(refreshSet?.opts.domain).toBe('.orkora.events');
    expect(refreshSet?.opts.httpOnly).toBe(true);

    process.env.COOKIE_DOMAIN = prev;
  });
});

describe('AuthController.signup non-enumeration', () => {
  it('returns the service response shape (verification_sent) and does not return a token bundle', async () => {
    const signupRequest = jest.fn().mockResolvedValue(okSignup);
    const { ctrl } = makeController({
      signupRequest: signupRequest as unknown as AuthService['signupRequest'],
    });

    const out = await ctrl.signup({
      email: 'a@example.com',
      password: 'correct-horse-battery-staple',
      fullName: 'A B',
    });

    expect(signupRequest).toHaveBeenCalledTimes(1);
    expect(out).toEqual({
      status: 'verification_sent',
      destination: 'a@example.com',
    });
    // Crucially, no accessToken / refreshToken in the response.
    expect((out as unknown as Record<string, unknown>).accessToken).toBeUndefined();
    expect((out as unknown as Record<string, unknown>).refreshToken).toBeUndefined();
  });

  it('passes the raw DTO through to the service (service does the normalization)', async () => {
    const signupRequest = jest.fn().mockResolvedValue({
      status: 'verification_sent',
      destination: 'a@example.com',
    });
    const { ctrl } = makeController({
      signupRequest: signupRequest as unknown as AuthService['signupRequest'],
    });

    await ctrl.signup({
      email: '  A@Example.com  ',
      password: 'correct-horse-battery-staple',
      fullName: 'A B',
    });

    expect(signupRequest).toHaveBeenCalledWith(
      expect.objectContaining({ email: '  A@Example.com  ' }),
    );
  });
});
