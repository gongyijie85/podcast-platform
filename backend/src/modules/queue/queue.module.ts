import { Global, Module, OnApplicationShutdown, OnModuleInit, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
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
          username: config.get<string>('redis.username') || undefined,
          password: config.get<string>('redis.password') || undefined,
          tls: config.get<boolean>('redis.tls') ? {} : undefined,
          enableOfflineQueue: false,
          connectTimeout: config.get<number>('queue.enqueueTimeoutMs') || 3000,
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
export class QueueModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(QueueModule.name);
  private queueEvents: QueueEvents[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly queueService: QueueService,
    @InjectQueue(QUEUE_NAMES.METADATA) private readonly metadataQ: Queue,
    @InjectQueue(QUEUE_NAMES.SCRIPT) private readonly scriptQ: Queue,
    @InjectQueue(QUEUE_NAMES.TTS) private readonly ttsQ: Queue,
    @InjectQueue(QUEUE_NAMES.SUBTITLE) private readonly subtitleQ: Queue,
    @InjectQueue(QUEUE_NAMES.MIX) private readonly mixQ: Queue,
  ) {}

  onModuleInit(): void {
    if (!this.queueService.isRedisMode()) {
      return;
    }

    const queues = [
      this.metadataQ,
      this.scriptQ,
      this.ttsQ,
      this.subtitleQ,
      this.mixQ,
    ];

    for (const queue of queues) {
      const events = new QueueEvents(queue.name, {
        connection: {
          host: this.config.get<string>('redis.host'),
          port: this.config.get<number>('redis.port'),
          username: this.config.get<string>('redis.username') || undefined,
          password: this.config.get<string>('redis.password') || undefined,
          tls: this.config.get<boolean>('redis.tls') ? {} : undefined,
        },
      });

      events.on('waiting', ({ jobId }) => {
        this.logger.debug(`[metrics] waiting ${queue.name} job=${jobId}`);
        this.queueService.incWaiting(queue.name);
      });
      events.on('completed', ({ jobId }) => {
        this.logger.debug(`[metrics] completed ${queue.name} job=${jobId}`);
        this.queueService.incCompleted(queue.name);
      });
      events.on('failed', ({ jobId }) => {
        this.logger.debug(`[metrics] failed ${queue.name} job=${jobId}`);
        this.queueService.incFailed(queue.name);
      });

      this.queueEvents.push(events);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.logger.log('QueueModule shutting down');
    await Promise.all(this.queueEvents.map((e) => e.close()));
  }
}
