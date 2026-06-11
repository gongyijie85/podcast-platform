import { Module, forwardRef } from '@nestjs/common';
import { MixService } from './mix.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [forwardRef(() => QueueModule)],
  providers: [MixService],
  exports: [MixService],
})
export class MixModule {}
