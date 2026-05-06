import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

/**
 * Global so the ApiKeyGuard (lives in auth/strategies) can inject
 * ApiKeysService without a cyclic import. Configuration is the same as
 * before; the only change is `@Global()`.
 */
@Global()
@Module({
  imports: [ConfigModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
