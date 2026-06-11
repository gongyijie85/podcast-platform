/**
 * ExportTmpController — dev/E2E-only static-file server for
 * `backend/tmp/exports/`.
 *
 * IMPORTANT: we use `@Controller()` (no path prefix) and the method
 * has `@Get(':filename')`. This is intentional:
 *  - `app.useStaticAssets(...)` already serves `/exports/*` for the
 *    common case (curl `--output file.mp3 http://.../exports/<runId>.mp3`).
 *  - This controller handles the FALLBACK case where a caller wants
 *    a richer response (e.g. `Content-Disposition: attachment`) or
 *    when the static handler is disabled. It is also the place where
 *    path-traversal protection is enforced.
 *
 * The controller is registered in `main.ts` (NOT in `ExportModule`),
 * so production can disable it with a single `if` guard.
 */

import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';

// Resolved at module load time. The backend is bootstrapped from
// the `backend/` working directory, so `process.cwd()` is already
// `.../podcast-platform/backend`. We resolve `tmp/exports` relative
// to that. (An extra `backend/` segment would have produced a
// double-nested `backend/backend/tmp/exports/` tree which is NOT
// what the root .gitignore matches.)
const EXPORTS_ROOT = path.resolve(process.cwd(), 'tmp', 'exports');

@Controller()
export class ExportTmpController {
  private readonly logger = new Logger(ExportTmpController.name);

  /**
   * Serve a single exported MP3. Filename must NOT contain `..` or
   * path separators — we reject anything that looks like a path
   * traversal attempt with HTTP 400.
   */
  @Public()
  @Get('exports/:filename')
  async getExport(
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      // Defence in depth: dev/E2E-only endpoint. 404 so the route
      // looks "absent" to prod clients (vs. 403 which would leak the
      // existence of the endpoint).
      res.status(404).json({ code: 70006, data: null, message: 'Not found' });
      return;
    }
    // Path-traversal guard. Reject `..`, leading slashes, and
    // anything that is not a plain `<runId>.mp3` shape.
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException({
        code: 70010,
        message: 'Invalid filename (path traversal not allowed)',
      });
    }
    if (!/^[A-Za-z0-9._-]+\.mp3$/.test(filename)) {
      throw new BadRequestException({
        code: 70011,
        message: 'Only MP3 files are servable via this endpoint',
      });
    }

    const absolutePath = path.join(EXPORTS_ROOT, filename);
    // Defence-in-depth: the resolved path MUST stay inside EXPORTS_ROOT.
    const resolved = path.resolve(absolutePath);
    if (!resolved.startsWith(EXPORTS_ROOT)) {
      throw new BadRequestException({
        code: 70012,
        message: 'Resolved path escaped the exports root',
      });
    }

    try {
      const buf = await fs.readFile(resolved);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', String(buf.length));
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
      res.status(200).end(buf);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException({
          code: 70013,
          message: `Export not found: ${filename}`,
        });
      }
      this.logger.error(`getExport failed: ${(e as Error).message}`);
      throw new NotFoundException({
        code: 70013,
        message: 'Export read failed',
      });
    }
  }
}
