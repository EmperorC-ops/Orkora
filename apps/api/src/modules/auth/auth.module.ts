import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
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
      useFactory: (cfg: ConfigService) => ({
        privateKey: cfg.get<string>('JWT_PRIVATE_KEY'),
        publicKey: cfg.get<string>('JWT_PUBLIC_KEY'),
        signOptions: {
          algorithm: 'RS256',
          expiresIn: cfg.get<string>('JWT_ACCESS_TTL'),
          issuer: 'orkora',
        },
        verifyOptions: { algorithms: ['RS256'], issuer: 'orkora' },
      }),
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
