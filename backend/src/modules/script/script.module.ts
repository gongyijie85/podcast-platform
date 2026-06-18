import { Module, forwardRef } from '@nestjs/common';
import { ScriptService } from './script.service';
import { ScriptController } from './script.controller';
import { OpenAICompatibleLlmAdapter } from './adapters/openai-compatible-llm.adapter';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [forwardRef(() => QueueModule)],
  providers: [ScriptService, OpenAICompatibleLlmAdapter],
  controllers: [ScriptController],
  exports: [ScriptService, OpenAICompatibleLlmAdapter],
})
export class ScriptModule {}
