import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configuration } from './config/configuration';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import * as path from 'node:path';

async function bootstrap() {
  // 生产环境启动前强制校验关键配置，避免使用默认值上线
  if (process.env.NODE_ENV === 'production') {
    const config = configuration();
    const unsafeJwtSecrets = ['', 'change-me', 'please-change-me-in-production'];
    const unsafeDatabaseUrls = [
      '',
      'postgresql://postgres:postgres@localhost:5432/podcast',
      'postgresql://postgres:postgres@postgres:5432/podcast',
    ];
    const unsafeCorsOrigins = ['', 'http://localhost:5173'];

    if (unsafeJwtSecrets.includes(config.jwt.secret)) {
      throw new Error('JWT_SECRET must be set to a secure value in production');
    }
    if (unsafeDatabaseUrls.includes(config.database.url)) {
      throw new Error('DATABASE_URL must be set to a production value');
    }
    if (config.corsOrigins.length === 0 || config.corsOrigins.every((o) => unsafeCorsOrigins.includes(o))) {
      throw new Error('CORS_ORIGINS must be set to production origins');
    }
  }

  // `NestExpressApplication` gives us access to express-specific
  // helpers like `useStaticAssets` (used by the v1.1 dev-only exports
  // directory). The cast is safe because the bootstrap explicitly
  // uses the express adapter.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  const globalPrefix = 'api';
  // Exclude `exports` from the global prefix so the v1.1
  // `ExportTmpController` lives at `/exports/:filename` (NOT
  // `/api/exports/:filename`). The path is intentionally dev-only —
  // see `ExportTmpController` for the production guard.
  app.setGlobalPrefix(globalPrefix, { exclude: ['exports/(.*)'] });

  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // v1.1 increment: dev/E2E-only static assets for `backend/tmp/exports/`.
  // The static handler is a fast-path for "curl <url> > file.mp3"
  // workflows. The `ExportTmpController` (registered in `ExportModule`)
  // is the authoritative layer for path-traversal validation and
  // the `Content-Disposition` header. The two layers are
  // complementary: static handler first, controller never reaches
  // for the same path because the static handler short-circuits.
  // We keep the static asset registration dev-only so a production
  // deploy cannot accidentally expose the flow-layer exports.
  if (process.env.NODE_ENV !== 'production') {
    // The backend is bootstrapped from `backend/`, so `tmp/exports`
    // (not `backend/tmp/exports`) keeps the on-disk layout consistent
    // with the root `.gitignore` rule (`backend/tmp/`).
    const exportsDir = path.resolve(process.cwd(), 'tmp', 'exports');
    app.useStaticAssets(exportsDir, { prefix: '/exports' });
  }

  const port = parseInt(process.env.PORT || '3001', 10);
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`Podcast Platform backend running on http://0.0.0.0:${port}/${globalPrefix}`);
  logger.log(`CORS origins: ${corsOrigins.join(', ')}`);
}

bootstrap().catch((err) => {
  console.error('Fatal startup error', err);
  process.exit(1);
});
