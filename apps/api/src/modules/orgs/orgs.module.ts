import { Module } from '@nestjs/common';
import { OrgsController, PublicBrandController } from './orgs.controller';
import { OrgsService } from './orgs.service';

@Module({
  controllers: [OrgsController, PublicBrandController],
  providers: [OrgsService],
  exports: [OrgsService],
})
export class OrgsModule {}
