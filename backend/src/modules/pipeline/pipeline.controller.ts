/**
 * PipelineController — v1.1 increment HTTP surface.
 *
 * Exposes ONE endpoint: `POST /api/pipeline/run` which calls
 * `PipelineService.runFullPipeline`. The endpoint is gated by
 * `@Public()` so the v1.0 JWT auth guard does not require a token
 * (we want the E2E suite and the curl-driven dev workflow to be
 * friction-free).
 *
 * Progress events are streamed to the server-side pino logger in
 * dev mode ONLY. We deliberately do NOT push progress over HTTP
 * (no SSE / no WebSocket) — the architecture §A6 决策 1 keeps the
 * flow layer callback-only. Clients that want live progress should
 * call the service directly with their own `ProgressCallback` (e.g.
 * a WebSocket bridge they wire up themselves).
 *
 * Production guard: the controller is part of `PipelineModule`, so
 * it IS wired up in prod. The `run()` method checks `NODE_ENV` and
 * throws HTTP 404 when in production (defensive — `main.ts` does
 * not set `useStaticAssets` in prod, but the route itself would
 * still be reachable via the Nest router otherwise).
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
} from '@nestjs/common';

import { Public } from '../auth/public.decorator';
import { PipelineService } from './pipeline.service';
import { RunPipelineDto } from './dto/run-pipeline.dto';
import type {
  PipelineInput,
  PipelineResult,
  ProgressEvent,
} from '@shared/pipeline';

@Controller('pipeline')
export class PipelineController {
  private readonly logger = new Logger(PipelineController.name);

  constructor(private readonly svc: PipelineService) {}

  /**
   * Kick off a full 4-step run. Returns the `PipelineResult` directly
   * (the global `ResponseInterceptor` wraps it in `{code: 0, data: ...}`).
   */
  @Public()
  @Post('run')
  @HttpCode(HttpStatus.OK)
  async run(@Body() body: RunPipelineDto): Promise<PipelineResult> {
    if (process.env.NODE_ENV === 'production') {
      // Defence in depth: the E2E + dev flow layer is not part of the
      // production contract. Returning 404 (not 403) signals "this
      // route is not part of the production API" to clients.
      throw new NotFoundException({
        code: 70006,
        message: 'Pipeline endpoints are dev/E2E only',
      });
    }

    // The DTO is already validated by the global `ValidationPipe`
    // registered in `main.ts`. We just convert it to the
    // `PipelineInput` shape the service expects.
    const input: PipelineInput = {
      isbns: body.isbns,
      options: body.options
        ? {
            hostVoice: body.options.hostVoice,
            guestVoice: body.options.guestVoice,
            bgmTrack: body.options.bgmTrack,
            bgmVolume: body.options.bgmVolume,
            fadeInSec: body.options.fadeInSec,
            fadeOutSec: body.options.fadeOutSec,
          }
        : undefined,
    };

    // Plumb progress to pino so the developer can see the run in
    // real time. We always wire the callback (even when not in dev
    // mode) because the controller itself is dev-only — the
    // NODE_ENV check above is the gate.
    const cb = (e: ProgressEvent) => {
      this.logger.log(
        `[progress] runId=${e.runId} step=${e.step} ${e.percent}% — ${e.message}`,
      );
    };
    try {
      return await this.svc.runFullPipeline(input, { progressCallback: cb });
    } catch (e: unknown) {
      // The orchestrator is supposed to convert step failures into a
      // `PipelineResult` with `status='partial'/'failed'`. This catch
      // is a safety net for truly unexpected errors (e.g. a programmer
      // forgot to wrap a step in try/catch).
      this.logger.error(`runFullPipeline threw: ${(e as Error).message}`);
      throw new HttpException(
        {
          code: 50000,
          message: (e as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
