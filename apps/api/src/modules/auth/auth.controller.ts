import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SendOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { SocialLoginDto } from './dto/social.dto';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';

const REFRESH_COOKIE = 'orkora_rt';
const REFRESH_COOKIE_PATH = '/v1/auth';

/**
 * The CSRF companion cookie must be readable by the web app's JavaScript,
 * which runs at page paths like `/dashboard` and `/onboarding` on the web
 * origin. A cookie scoped to `Path=/v1/auth` (the refresh cookie's path) is
 * NOT exposed to `document.cookie` on those pages, so `readCsrfCookie()`
 * would return null and the double-submit header would never be sent. The
 * CSRF cookie therefore lives at `Path=/` (readable everywhere) while the
 * httpOnly refresh token stays narrowly scoped to `/v1/auth` (it only ever
 * needs to be SENT to the refresh endpoint, never read by JS).
 */
const CSRF_COOKIE_PATH = '/';

/**
 * Double-submit cookie CSRF protection on /auth/refresh.
 *
 * The refresh cookie itself is `httpOnly + SameSite=None` (so cross-site
 * `fetch` from the web app works), which means the browser will attach it on
 * cross-site form posts too. The access-token call to /v1/auth/refresh
 * therefore has to prove the caller is the legitimate web app, not a third
 * party who can ride the cookie.
 *
 * `orkora_csrf` is a sibling cookie that mirrors a random token. It is set
 * with the SAME `SameSite/Secure` shape as the refresh cookie BUT it is
 * *not* httpOnly so the web app's JS can read it. On every refresh call the
 * web app reads `orkora_csrf` and echoes it back as `X-CSRF-Token`. The API
 * accepts the refresh ONLY if header == cookie (constant-time compare).
 *
 * A foreign origin can cause the browser to send `orkora_csrf` along with
 * `orkora_rt`, but it CANNOT read either cookie (httpOnly for the refresh
 * token, cross-origin script policy for the CSRF cookie), so it cannot set
 * the matching header. The classic double-submit invariant.
 *
 * Legacy mobile/older-web clients that pass `refreshToken` in the body do
 * not use cookies at all, so the CSRF check is skipped for that path. The
 * cookie path is the only one a browser can be tricked into.
 */
const CSRF_COOKIE = 'orkora_csrf';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_TOKEN_BYTES = 32;

interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Cookie shape for the refresh token:
 *   - httpOnly: not reachable from JS (defends against XSS).
 *   - secure: only sent over HTTPS in production.
 *   - sameSite: 'lax' so a top-level redirect from a payment provider can
 *     still carry the cookie back, but cross-site XHRs cannot.
 *   - path: scoped to /v1/auth so it never travels with API calls that
 *     don't need it.
 *   - maxAge: matches JWT_REFRESH_TTL (30 days by default).
 */
/**
 * In production the web client and the API are usually on different sites
 * (e.g. *.vercel.app and *.onrender.com), so the refresh cookie has to be
 * `SameSite=None; Secure` for the browser to send it on cross-site `fetch`
 * with `credentials: 'include'`. In development everything is on
 * localhost, so `SameSite=Lax` is sufficient and avoids needing HTTPS.
 */
const COOKIE_SAMESITE: 'lax' | 'none' =
  process.env.NODE_ENV === 'production' ? 'none' : 'lax';
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

/**
 * Registrable-domain scope for the auth cookies.
 *
 * CRITICAL for the double-submit CSRF pattern to work at all in production.
 * The web app runs on `orkora.events` / `www.orkora.events` and the API on
 * `api.orkora.events`. Without a Domain attribute, `res.cookie` sets the
 * cookie HOST-ONLY on `api.orkora.events`. That makes the non-httpOnly
 * `orkora_csrf` cookie UNREADABLE by the web app's JavaScript (which runs on
 * a different host), so `readCsrfCookie()` on the web always returns null,
 * the `X-CSRF-Token` header is never sent, and every cookie-path refresh
 * fails with 403 "CSRF token mismatch". Returning visitors who hold a stale
 * `orkora_rt` then dead-end (incognito works only because it has no stale
 * cookie to trigger a refresh). Setting `Domain=.orkora.events` shares both
 * cookies across every orkora.events subdomain, so the web app can read the
 * CSRF cookie and the double-submit invariant holds.
 *
 * Sourced from `COOKIE_DOMAIN` env so staging (`.staging.orkora.events` or
 * unset) and local dev (unset -> host-only on localhost) behave correctly.
 * Leave unset anywhere the web and API are not on the same registrable
 * domain; the cookie then falls back to host-only (the pre-fix behaviour).
 */
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN?.trim() || undefined;

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    domain: COOKIE_DOMAIN,
    path: REFRESH_COOKIE_PATH,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

/**
 * Companion to the refresh cookie. NOT httpOnly so the web app can read it
 * and echo it back in `X-CSRF-Token`. Same site/secure shape so the browser
 * attaches it on the same cross-site requests as the refresh cookie.
 */
function setCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    domain: COOKIE_DOMAIN,
    path: CSRF_COOKIE_PATH,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response) {
  // Clear the domain-scoped cookies (the post-fix shape).
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    domain: COOKIE_DOMAIN,
    path: REFRESH_COOKIE_PATH,
  });
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    domain: COOKIE_DOMAIN,
    path: CSRF_COOKIE_PATH,
  });
  // Also clear the LEGACY variants that returning customers still hold from
  // before COOKIE_DOMAIN / the CSRF path change. A same-name cookie at a
  // narrower (host-only) scope, or at the old `/v1/auth` CSRF path, would
  // otherwise linger and collide with the new cookie. We explicitly expire
  // each legacy shape here. All harmless when no legacy cookie exists.
  if (COOKIE_DOMAIN) {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      path: REFRESH_COOKIE_PATH,
    });
    res.clearCookie(CSRF_COOKIE, {
      httpOnly: false,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      path: CSRF_COOKIE_PATH,
    });
  }
  // Legacy CSRF cookie at the pre-fix `/v1/auth` path (domain-scoped and
  // host-only). Expire both so it cannot shadow the new `Path=/` cookie.
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    domain: COOKIE_DOMAIN,
    path: REFRESH_COOKIE_PATH,
  });
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    path: REFRESH_COOKIE_PATH,
  });
}

/**
 * Constant-time string comparison. Returns false on any length mismatch (so
 * we never feed unequal-length buffers to timingSafeEqual, which throws).
 */
function safeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Wraps a login response to set the refresh cookie alongside returning the
 * bundle. We still return the refresh token in the body for older clients
 * that have not migrated to cookie-based refresh; new web clients ignore
 * the field and rely on the cookie. Every cookie-issuing path also rotates
 * the CSRF cookie so the value the web app reads stays in lockstep with
 * what the server expects to see echoed back.
 */
function shapeWithCookie(bundle: TokenBundle, res: Response) {
  setRefreshCookie(res, bundle.refreshToken);
  setCsrfCookie(res, randomBytes(CSRF_TOKEN_BYTES).toString('base64url'));
  return bundle;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
  ) {}

  /**
   * Signup is non-enumerating: the response shape, status code, body, and
   * timing are identical whether or not the email is already registered.
   * The service always does the argon2 hash work (constant-ish time), then
   * either creates a pending unverified user OR sends a "someone tried to
   * sign up with your email" notice to the existing account. In both cases
   * we respond 202 with the same body. The caller is expected to follow up
   * with `/auth/otp/exchange` once the user enters the code from email.
   *
   * Token bundle is intentionally NOT returned here: a user is not signed
   * in until they prove control of the email by completing the OTP flow.
   * This means legacy callers that expected an immediate access token from
   * /auth/signup must migrate; the web client and mobile app already use
   * the OTP exchange and so are unaffected.
   */
  @Post('signup')
  @HttpCode(202)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async signup(@Body() dto: SignupDto) {
    return this.auth.signupRequest(dto);
  }

  @Post('login')
  @HttpCode(200)
  // Brute-force defense on the password path: 10 attempts/min per IP (or user).
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return shapeWithCookie(await this.auth.login(dto), res);
  }

  /**
   * Verify a Google or Apple ID token issued client side, then issue our own session.
   * The provider field is one of: 'google' | 'apple'.
   */
  @Post('social')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async social(
    @Body() dto: SocialLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return shapeWithCookie(await this.auth.social(dto), res);
  }

  /**
   * Refresh: prefers the httpOnly cookie, falls back to a body field for
   * legacy clients (mobile, older web). Either source is accepted; the
   * cookie is rotated either way.
   *
   * CSRF protection on the cookie path: the X-CSRF-Token header MUST match
   * the orkora_csrf cookie. The body-token path is exempt because a CSRF
   * attacker cannot set a JSON body on a cross-site request without the
   * browser doing a CORS preflight first (which we deny via CORS for
   * untrusted origins).
   */
  @Post('refresh')
  @HttpCode(200)
  // Refresh runs whenever an access token expires; generous but bounded so a
  // leaked/looping client cannot hammer the rotation path.
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async refresh(
    @Body() dto: RefreshDto | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies =
      (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
    const cookieToken = cookies[REFRESH_COOKIE];
    const bodyToken = dto?.refreshToken;
    const token = cookieToken ?? bodyToken;

    if (!token) {
      // Mirror UnauthorizedException semantics without importing the class
      // for one-off use; throwing a typed error from the service is cleaner
      // long term but this keeps the change small.
      res.status(401);
      return { message: 'No refresh token' };
    }

    // Cookie-path requires the double-submit CSRF check. The body-path is
    // exempt because the caller had to put the refresh token in the body
    // explicitly (which a CSRF cannot do without a CORS preflight).
    if (cookieToken && !bodyToken) {
      const cookieCsrf = cookies[CSRF_COOKIE];
      const headerCsrfRaw = req.header(CSRF_HEADER);
      const headerCsrf = Array.isArray(headerCsrfRaw) ? headerCsrfRaw[0] : headerCsrfRaw;
      if (!cookieCsrf || !headerCsrf || !safeStringEqual(cookieCsrf, headerCsrf)) {
        throw new ForbiddenException('CSRF token mismatch');
      }
    }

    return shapeWithCookie(await this.auth.refresh(token), res);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.userId);
    clearRefreshCookie(res);
  }

  // OTP endpoints. Tighter rate limit: 5 sends per minute per IP.
  @Post('otp/send')
  @HttpCode(202)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.otp.send(dto);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    await this.otp.verify(dto);
    return { verified: true };
  }

  /**
   * Convenience: verifies an OTP and immediately issues a token bundle in
   * one round trip. Used by the magic-link / sign-in-by-email flow on the
   * web and mobile apps.
   */
  @Post('otp/exchange')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async exchangeOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    await this.otp.verify(dto);
    return shapeWithCookie(await this.auth.loginWithVerifiedEmail(dto.destination), res);
  }
}
