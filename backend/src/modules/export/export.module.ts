import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { ExportTmpController } from './export-tmp.controller';
import { SubtitleModule } from '../subtitle/subtitle.module';

/**
 * ExportModule — v1.0 + v1.1 increment combined.
 *
 *  - `ExportService` / `ExportController` are the v1.0 project-level
 *    export endpoints (`/api/projects/:id/audio`, `/subtitle`, `/export`).
 *  - `ExportTmpController` is the v1.1 dev/E2E-only endpoint
 *    (`/exports/:filename`) for serving the local-disk exports
 *    produced by `LocalDiskStorageAdapter`. It is registered alongside
 *    the v1.0 controllers in this module for DI convenience — the
 *    controller itself enforces the `NODE_ENV !== 'production'` guard.
 */
@Module({
  imports: [SubtitleModule],
  providers: [ExportService],
  controllers: [ExportController, ExportTmpController],
  exports: [ExportService],
})
export class ExportModule {}
