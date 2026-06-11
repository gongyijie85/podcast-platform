import { Module, forwardRef } from '@nestjs/common';
import { SubtitleService } from './subtitle.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [forwardRef(() => QueueModule)],
  providers: [SubtitleService],
  exports: [SubtitleService],
})
export class SubtitleModule {}
