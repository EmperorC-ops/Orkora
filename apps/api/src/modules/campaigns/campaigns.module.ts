import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { CampaignsController, CampaignsPublicController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { AudienceMaterialiser } from './audience.materialiser';
import { PostmarkAuthGuard } from './postmark-auth.guard';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [CampaignsController, CampaignsPublicController],
  providers: [CampaignsService, AudienceMaterialiser, PostmarkAuthGuard],
  exports: [CampaignsService],
})
export class CampaignsModule {}
