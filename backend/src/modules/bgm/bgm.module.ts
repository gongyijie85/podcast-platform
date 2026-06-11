import { Module } from '@nestjs/common';
import { BgmService } from './bgm.service';
import { BgmController } from './bgm.controller';

@Module({
  providers: [BgmService],
  controllers: [BgmController],
  exports: [BgmService],
})
export class BgmModule {}
