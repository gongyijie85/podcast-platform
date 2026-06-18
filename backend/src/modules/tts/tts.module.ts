import { Module, forwardRef } from '@nestjs/common';
import { TtsService } from './tts.service';
import { TtsController } from './tts.controller';
import { VolcengineAdapter } from './adapters/volcengine.adapter';
import { AzureAdapter } from './adapters/azure.adapter';
import { XiaomiMimoAdapter } from './adapters/xiaomi-mimo.adapter';
import { StorageModule } from '../storage/storage.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [StorageModule, forwardRef(() => QueueModule)],
  providers: [TtsService, VolcengineAdapter, AzureAdapter, XiaomiMimoAdapter],
  controllers: [TtsController],
  exports: [TtsService, VolcengineAdapter, AzureAdapter, XiaomiMimoAdapter],
})
export class TtsModule {}
