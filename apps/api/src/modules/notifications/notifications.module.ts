import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_PROVIDER, SMS_PROVIDER } from './tokens';
import { NotificationsService } from './notifications.service';
import { ConsoleEmailProvider, PostmarkEmailProvider } from './providers/email';
import { ConsoleSmsProvider, TermiiSmsProvider, TwilioSmsProvider } from './providers/sms';

@Module({
  providers: [
    NotificationsService,
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const token = cfg.get<string>('POSTMARK_TOKEN');
        if (token) return new PostmarkEmailProvider(token);
        return new ConsoleEmailProvider();
      },
    },
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const termii = cfg.get<string>('TERMII_API_KEY');
        if (termii) return new TermiiSmsProvider(termii);
        const twilioSid = cfg.get<string>('TWILIO_SID');
        const twilioToken = cfg.get<string>('TWILIO_AUTH_TOKEN');
        if (twilioSid && twilioToken) return new TwilioSmsProvider(twilioSid, twilioToken);
        return new ConsoleSmsProvider();
      },
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
