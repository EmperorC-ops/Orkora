import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from '../notifications/notifications.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { OrganizerPaymentsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentPreferencesController } from './preferences.controller';
import { PaymentPreferencesService } from './preferences.service';
import { FlutterwaveProvider } from './providers/flutterwave.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { PaymentsRegistry } from './providers/registry';
import { StripeProvider } from './providers/stripe.provider';
import { StaleHoldCron } from './stale-hold.cron';

@Module({
  imports: [ConfigModule, ScheduleModule.forRoot(), NotificationsModule, RegistrationsModule],
  controllers: [PaymentsController, OrganizerPaymentsController, PaymentPreferencesController],
  providers: [
    PaymentsService,
    PaymentsRegistry,
    PaymentPreferencesService,
    StripeProvider,
    PaystackProvider,
    FlutterwaveProvider,
    StaleHoldCron,
  ],
  exports: [PaymentsService, PaymentsRegistry, PaymentPreferencesService],
})
export class PaymentsModule {}
