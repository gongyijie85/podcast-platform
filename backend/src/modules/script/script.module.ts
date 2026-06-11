import { Module, forwardRef } from '@nestjs/common';
import { ScriptService } from './script.service';
import { ScriptController } from './script.controller';
import { DoubaoAdapter } from './adapters/doubao.adapter';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [forwardRef(() => QueueModule)],
  providers: [ScriptService, DoubaoAdapter],
  controllers: [ScriptController],
  exports: [ScriptService, DoubaoAdapter],
})
export class ScriptModule {}
