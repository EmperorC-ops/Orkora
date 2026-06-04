import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { JwtStrategy, jwtKidFor } from './strategies/jwt.strategy';
import { ApiKeyGuard, JwtOrApiKeyGuard } from './strategies/api-key.guard';
import { GoogleVerifier, AppleVerifier } from './verifiers/social';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const publicKey = cfg.get<string>('JWT_PUBLIC_KEY');
        return {
          privateKey: cfg.get<string>('JWT_PRIVATE_KEY'),
          publicKey,
          signOptions: {
            algorithm: 'RS256' as const,
            expiresIn: cfg.get<string>('JWT_ACCESS_TTL'),
            issuer: 'orkora',
            // Stamp every issued token with the kid of the public key it was
            // signed against. The strategy uses this to pick the right
            // verification key during a JWT_PUBLIC_KEY_PREVIOUS overlap. See
            // strategies/jwt.strategy.ts for the rotation playbook.
            ...(publicKey ? { keyid: jwtKidFor(publicKey) } : {}),
          },
          verifyOptions: { algorithms: ['RS256' as const], issuer: 'orkora' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    JwtStrategy,
    ApiKeyGuard,
    JwtOrApiKeyGuard,
    GoogleVerifier,
    AppleVerifier,
  ],
  exports: [AuthService, ApiKeyGuard, JwtOrApiKeyGuard],
})
export class AuthModule {}
