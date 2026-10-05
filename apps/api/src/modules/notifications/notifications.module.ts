import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
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
        if (token) {
          const from = cfg.get<string>('EMAIL_FROM_ADDRESS') ?? 'no-reply@orkora.events';
          return new PostmarkEmailProvider(token, from);
        }
        // The console provider "sends" by printing to stdout and reporting
        // success. That is right for local dev and catastrophic in production:
        // every ticket, OTP, and receipt would vanish with no error anywhere.
        // We still boot (an API with no mail beats no API), but make it
        // impossible to miss.
        if (cfg.get<string>('NODE_ENV') === 'production') {
          const msg =
            'POSTMARK_TOKEN is not set in production: all outbound email is being ' +
            'discarded to stdout. Set POSTMARK_TOKEN on the API service.';
          new Logger('NotificationsModule').error(msg);
          Sentry.captureMessage(msg, { level: 'fatal', tags: { component: 'email' } });
        }
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
