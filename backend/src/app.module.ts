import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import * as path from 'node:path';

import { configuration } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';

import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ProjectModule } from './modules/project/project.module';
import { BookModule } from './modules/book/book.module';
import { ScriptModule } from './modules/script/script.module';
import { TtsModule } from './modules/tts/tts.module';
import { BgmModule } from './modules/bgm/bgm.module';
import { SubtitleModule } from './modules/subtitle/subtitle.module';
import { MixModule } from './modules/mix/mix.module';
import { StorageModule } from './modules/storage/storage.module';
import { QueueModule } from './modules/queue/queue.module';
import { WsModule } from './modules/ws/ws.module';
import { ExportModule } from './modules/export/export.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';

/**
 * Resolve the path to the optional `pino-pretty` binary. We wrap the lookup
 * in a try/catch so that:
 *   - the production image can ship WITHOUT `pino-pretty` (it's only a
 *     dev-time pretty-printer; in production pino logs raw NDJSON to stdout,
 *     which is what container log collectors want).
 *   - if a developer forgets to `pnpm install` after a clean clone, the dev
 *     server still starts (it just falls back to raw pino output).
 */
function tryResolvePinoPrettyTarget():
  | { target: string; options: { singleLine: true } }
  | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  try {
    // require.resolve throws MODULE_NOT_FOUND when the package is missing
    // (or the binary file is absent). Both are recoverable.
    const target = require.resolve('pino-pretty');
    return { target, options: { singleLine: true } };
  } catch {
    return undefined;
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env.local'),
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '..', '.env.local'),
        path.resolve(process.cwd(), '..', '.env'),
      ],
      load: [configuration],
    }),
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          level: process.env.LOG_LEVEL || 'info',
          transport: tryResolvePinoPrettyTarget(),
        },
      }),
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 60_000, limit: 60 },
    ]),
    PrismaModule,
    AuthModule,
    UserModule,
    ProjectModule,
    BookModule,
    ScriptModule,
    TtsModule,
    BgmModule,
    SubtitleModule,
    MixModule,
    StorageModule,
    QueueModule,
    WsModule,
    ExportModule,
    PipelineModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
