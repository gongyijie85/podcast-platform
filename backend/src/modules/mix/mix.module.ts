import { Module, forwardRef } from '@nestjs/common';
import { MixService } from './mix.service';
import { QueueModule } from '../queue/queue.module';
import { BgmModule } from '../bgm/bgm.module';

@Module({
  imports: [forwardRef(() => QueueModule), BgmModule],
  providers: [MixService],
  exports: [MixService],
})
export class MixModule {}
