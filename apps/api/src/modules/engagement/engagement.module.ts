import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import {
  OrganizerPollsController,
  OrganizerQaController,
  PublicEngagementController,
} from './engagement.controller';
import { EngagementGateway } from './engagement.gateway';
import { EngagementService } from './engagement.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        // We only verify here; passport-jwt elsewhere does the same.
        publicKey: cfg.getOrThrow<string>('JWT_PUBLIC_KEY'),
        verifyOptions: { algorithms: ['RS256'], issuer: 'orkora' },
      }),
    }),
  ],
  controllers: [
    PublicEngagementController,
    OrganizerPollsController,
    OrganizerQaController,
  ],
  providers: [EngagementService, EngagementGateway],
  exports: [EngagementService],
})
export class EngagementModule {}
