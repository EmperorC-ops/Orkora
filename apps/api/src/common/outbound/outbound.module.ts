import { Global, Module } from '@nestjs/common';
import { OutboundGuardService } from './outbound-guard.service';
import { TurnstileService } from './turnstile';

/**
 * Outbound protection shared by every module that can make Orkora send a
 * message: caps and kill switch (OutboundGuardService) and the bot check
 * (TurnstileService). Global so services can inject them without wiring.
 */
@Global()
@Module({
  providers: [OutboundGuardService, TurnstileService],
  exports: [OutboundGuardService, TurnstileService],
})
export class OutboundModule {}
