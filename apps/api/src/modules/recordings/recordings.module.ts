import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import {
  RecordingsController,
  RecordingsPublicController,
} from './recordings.controller';
import { RecordingsService } from './recordings.service';

@Module({
  // UploadsModule exports StorageService, which the service uses to build the
  // public playback URL for uploaded (R2) recordings.
  imports: [PrismaModule, UploadsModule],
  controllers: [RecordingsPublicController, RecordingsController],
  providers: [RecordingsService],
  exports: [RecordingsService],
})
export class RecordingsModule {}
