import { IsEnum, IsString, MinLength } from 'class-validator';

/**
 * Social login. The client obtains an ID token from Google or Apple,
 * we verify it server side and either find or create the matching user.
 */
export class SocialLoginDto {
  @IsEnum(['google', 'apple'])
  provider!: 'google' | 'apple';

  @IsString()
  @MinLength(20)
  idToken!: string;
}
