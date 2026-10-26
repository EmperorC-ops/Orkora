import { IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

/**
 * Codes go to email only, for signup and login only. SMS and the unused
 * purposes (payment_confirm, phone_verify) were removed in the October 2026
 * abuse hardening: an anonymous endpoint that can text any number is a toll
 * fraud target, and nothing in the product used them.
 */
export class SendOtpDto {
  @IsEnum(['email'])
  channel!: 'email';

  @IsString()
  @MaxLength(254)
  destination!: string;

  @IsEnum(['signup', 'login'])
  purpose!: 'signup' | 'login';

  /** Cloudflare Turnstile token, required once Turnstile keys are set. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;

  /** Honeypot. Hidden from people; a filled value marks a bot. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  hpField?: string;
}

export class VerifyOtpDto {
  @IsString()
  @MaxLength(254)
  destination!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Code must be 6 digits' })
  code!: string;

  @IsEnum(['signup', 'login'])
  purpose!: 'signup' | 'login';
}
