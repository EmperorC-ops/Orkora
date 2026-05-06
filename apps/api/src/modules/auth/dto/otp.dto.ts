import { IsEnum, IsString, Length, Matches } from 'class-validator';

export class SendOtpDto {
  @IsEnum(['email', 'sms'])
  channel!: 'email' | 'sms';

  @IsString()
  destination!: string;

  @IsEnum(['signup', 'login', 'payment_confirm', 'phone_verify'])
  purpose!: 'signup' | 'login' | 'payment_confirm' | 'phone_verify';
}

export class VerifyOtpDto {
  @IsString()
  destination!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Code must be 6 digits' })
  code!: string;

  @IsEnum(['signup', 'login', 'payment_confirm', 'phone_verify'])
  purpose!: 'signup' | 'login' | 'payment_confirm' | 'phone_verify';
}
