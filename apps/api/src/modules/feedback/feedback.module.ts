import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import {
  FeedbackController,
  FeedbackPublicController,
} from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [PrismaModule],
  controllers: [FeedbackPublicController, FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
