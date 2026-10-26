import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

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
