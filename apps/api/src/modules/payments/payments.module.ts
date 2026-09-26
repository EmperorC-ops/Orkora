import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from '../notifications/notifications.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { OrganizerPaymentsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentPreferencesController } from './preferences.controller';
import { PaymentPreferencesService } from './preferences.service';
import { ConnectedAccountsController } from './connected-accounts.controller';
import { ConnectedAccountsService } from './connected-accounts.service';
import { FlutterwaveProvider } from './providers/flutterwave.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { PaymentsRegistry } from './providers/registry';
import { StripeProvider } from './providers/stripe.provider';
import { PaymentsMaintenanceCron } from './payments-maintenance.cron';

@Module({
  imports: [ConfigModule, ScheduleModule.forRoot(), NotificationsModule, RegistrationsModule],
  controllers: [
    PaymentsController,
    OrganizerPaymentsController,
    PaymentPreferencesController,
    ConnectedAccountsController,
  ],
  providers: [
    PaymentsService,
    PaymentsRegistry,
    PaymentPreferencesService,
    ConnectedAccountsService,
    StripeProvider,
    PaystackProvider,
    FlutterwaveProvider,
    PaymentsMaintenanceCron,
  ],
  exports: [PaymentsService, PaymentsRegistry, PaymentPreferencesService, ConnectedAccountsService],
})
export class PaymentsModule {}
