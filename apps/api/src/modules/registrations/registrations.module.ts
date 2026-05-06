import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  CheckinController,
  MeRegistrationsController,
  OrganizerRegistrationsController,
  OrgRegistrationsController,
  PublicRegistrationsController,
  TicketsController,
} from './registrations.controller';
import { RegistrationsService } from './registrations.service';
import { TicketSigner } from './ticket-signer';

@Module({
  imports: [ConfigModule, NotificationsModule],
  controllers: [
    PublicRegistrationsController,
    TicketsController,
    MeRegistrationsController,
    OrganizerRegistrationsController,
    OrgRegistrationsController,
    CheckinController,
  ],
  providers: [RegistrationsService, TicketSigner],
  exports: [RegistrationsService, TicketSigner],
})
export class RegistrationsModule {}
