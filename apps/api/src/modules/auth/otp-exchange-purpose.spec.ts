import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { OtpService } from './otp.service';
import type { VerifyOtpDto } from './dto/otp.dto';

/**
 * /auth/otp/exchange purpose handling.
 *
 * This endpoint previously hardcoded purpose='login'. That was the right
 * instinct (a payment_confirm code must never buy a session) implemented in a
 * way that broke signup: AuthService mints the signup code with
 * purpose='signup', so every signup code failed to match a row and the user
 * saw "invalid code" for a code that had just landed in their inbox.
 *
 * The fix is an allowlist, so both properties have to hold at once: signup
 * codes work, and non-session purposes still do not.
 */

const okBundle = { accessToken: 'a', refreshToken: 'r', expiresIn: 900 };

function makeController() {
  const verify = jest.fn().mockResolvedValue(undefined);
  const loginWithVerifiedEmail = jest.fn().mockResolvedValue(okBundle);
  const ctrl = new AuthController(
    { loginWithVerifiedEmail } as unknown as AuthService,
    { verify, send: jest.fn() } as unknown as OtpService,
  );
  return { ctrl, verify, loginWithVerifiedEmail };
}

function makeRes() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    status: jest.fn().mockReturnThis(),
  } as never;
}

function dto(purpose: VerifyOtpDto['purpose']): VerifyOtpDto {
  return { destination: 'buyer@example.com', code: '123456', purpose };
}

describe('AuthController.exchangeOtp purpose allowlist', () => {
  it.each(['signup', 'login'] as const)(
    'exchanges a %s code and verifies against that same purpose',
    async (purpose) => {
      const { ctrl, verify, loginWithVerifiedEmail } = makeController();

      await ctrl.exchangeOtp(dto(purpose), makeRes());

      // The purpose the code was minted with must be the purpose we look up,
      // or the row is never found. This is the exact assertion the old
      // hardcoded purpose='login' would fail for signup.
      expect(verify).toHaveBeenCalledWith({
        destination: 'buyer@example.com',
        code: '123456',
        purpose,
      });
      expect(loginWithVerifiedEmail).toHaveBeenCalledWith('buyer@example.com');
    },
  );

  it.each(['payment_confirm', 'phone_verify'] as const)(
    'refuses to exchange a %s code for a session',
    async (purpose) => {
      const { ctrl, verify, loginWithVerifiedEmail } = makeController();

      await expect(ctrl.exchangeOtp(dto(purpose), makeRes())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      // Rejected before the code is even checked, so a valid payment code is
      // never consumed by an exchange attempt.
      expect(verify).not.toHaveBeenCalled();
      expect(loginWithVerifiedEmail).not.toHaveBeenCalled();
    },
  );
});
