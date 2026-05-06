import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsController, OrganizerEventsController } from './events.controller';
import { PublicApiEventsController } from './public-api.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AuthModule],
  controllers: [EventsController, OrganizerEventsController, PublicApiEventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
