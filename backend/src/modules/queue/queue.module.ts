import { Global, Module, OnApplicationShutdown, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { MetadataProcessor } from './processors/metadata.processor';
import { ScriptProcessor } from './processors/script.processor';
import { TtsProcessor } from './processors/tts.processor';
import { SubtitleProcessor } from './processors/subtitle.processor';
import { MixProcessor } from './processors/mix.processor';
import { BookModule } from '../book/book.module';
import { ScriptModule } from '../script/script.module';
import { TtsModule } from '../tts/tts.module';
import { SubtitleModule } from '../subtitle/subtitle.module';
import { MixModule } from '../mix/mix.module';
import { StorageModule } from '../storage/storage.module';
import { WsModule } from '../ws/ws.module';
import { Logger } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QUEUE_NAMES } from './constants';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password') || undefined,
        },
        defaultJobOptions: {
          attempts: config.get<number>('limits.maxRetry') || 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 86400 },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.METADATA },
      { name: QUEUE_NAMES.SCRIPT },
      { name: QUEUE_NAMES.TTS },
      { name: QUEUE_NAMES.SUBTITLE },
      { name: QUEUE_NAMES.MIX },
    ),
    forwardRef(() => BookModule),
    forwardRef(() => ScriptModule),
    forwardRef(() => TtsModule),
    forwardRef(() => SubtitleModule),
    forwardRef(() => MixModule),
    StorageModule,
    WsModule,
  ],
  providers: [QueueService, MetadataProcessor, ScriptProcessor, TtsProcessor, SubtitleProcessor, MixProcessor],
  exports: [QueueService, BullModule],
})
export class QueueModule implements OnApplicationShutdown {
  private readonly logger = new Logger(QueueModule.name);

  async onApplicationShutdown(): Promise<void> {
    this.logger.log('QueueModule shutting down');
  }
}
