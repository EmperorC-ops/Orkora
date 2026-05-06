import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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
function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  });
}

/**
 * Wraps a login response to set the refresh cookie alongside returning the
 * bundle. We still return the refresh token in the body for older clients
 * that have not migrated to cookie-based refresh; new web clients ignore
 * the field and rely on the cookie.
 */
function shapeWithCookie(bundle: TokenBundle, res: Response) {
  setRefreshCookie(res, bundle.refreshToken);
  return bundle;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
  ) {}

  @Post('signup')
  @HttpCode(201)
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return shapeWithCookie(await this.auth.signup(dto), res);
  }

  @Post('login')
  @HttpCode(200)
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
   */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      ((req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE]) ??
      dto?.refreshToken;
    if (!token) {
      // Mirror UnauthorizedException semantics without importing the class
      // for one-off use; throwing a typed error from the service is cleaner
      // long term but this keeps the change small.
      res.status(401);
      return { message: 'No refresh token' };
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
