import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [ConfigModule],
  controllers: [UploadsController],
  providers: [StorageService, UploadsService],
  exports: [StorageService, UploadsService],
})
export class UploadsModule {}
