/**
 * PipelineService — the v1.1 flow-layer orchestrator.
 *
 * Implements `runFullPipeline(input, options?): Promise<PipelineResult>`
 * which serially chains 4 steps:
 *
 *   1. fetch book metadata (via BOOK_ADAPTER, default = MockBookMetadataAdapter)
 *   2. generate 6-stage × 2-line script (via LLM_ADAPTER, default = MockScriptGenAdapter)
 *   3. TTS-synth 12 segments + ffmpeg mix (via TTS_ADAPTER, default = MockTtsAdapter)
 *   4. export to LocalDiskStorageAdapter (via STORAGE_ADAPTER, default = LocalDiskStorageAdapter)
 *
 * State machine (architecture §A2.3):
 *
 *   isbns empty                          → failed  (70001)
 *   step 1 all ISBNs fail                → failed  (70002), 步 2/3/4 skipped
 *   step 1 partial fail (≥1 success)     → continue with first successful book
 *   step 2 throws                        → partial, 步 3/4 skipped
 *   step 3 throws (after per-seg fallback) → partial, 步 4 skipped
 *   step 3 single-segment TTS failure    → silent-fallback, status='partial'
 *   step 4 throws                        → partial
 *   all 4 success                        → success
 *
 * Progress reporting (architecture §A6 决策 1):
 *   - Callers pass a `progressCallback?: ProgressCallback` (NOT a
 *     WebSocket, NOT an EventEmitter). Each step emits 0% / midpoint
 *     ticks / 100% via `emitProgress()`.
 *   - The callback is invoked in a try/catch (see `progress.ts`) so a
 *     buggy consumer cannot crash the run.
 *
 * Filesystem layout:
 *   - Per-run scratch dir: `backend/tmp/pipeline/<runId>/`
 *   - Step 1: writes `01-metadata.json`
 *   - Step 2: writes `02-script.json`
 *   - Step 3: writes `03-mixed.mp3`
 *   - Step 4: writes `04-exported.mp3` (copy of 03) + a copy in `backend/tmp/exports/<runId>.mp3`
 *
 * Hard guardrails (architecture §A8.1, this module's contract):
 *   - NEVER imports `PrismaService`, `QueueService`, or `ProgressGateway`
 *     (v1.0 modules the flow layer is explicitly decoupled from).
 *   - ffmpeg calls go through `FfmpegUtil.run` / `FfmpegUtil.mixWithBgm`
 *     — direct `require('fluent-ffmpeg')` is FORBIDDEN.
 *   - `runId` is `randomUUID()` (NOT `Date.now()`).
 *   - All thrown errors are `Error` subclasses (NOT bare strings).
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { BookApiAdapter } from '../book/adapters/book-api.adapter';
import type { LlmAdapter } from '../script/adapters/llm.adapter';
import type { TtsAdapter } from '../tts/adapters/tts.adapter';
import type { StorageAdapter } from '../storage/adapters/storage.adapter';

import {
  BOOK_ADAPTER,
  LLM_ADAPTER,
  TTS_ADAPTER,
  STORAGE_ADAPTER,
} from './pipeline.tokens';
import { makeMonotonicProgressCallback } from './progress';

import { runStep1, type Step1Output } from './steps/step1-metadata';
import { runStep2, type Step2Output } from './steps/step2-script';
import { runStep3, type Step3Output } from './steps/step3-tts-mix';
import { runStep4, type Step4Output } from './steps/step4-export';

import type {
  PipelineInput,
  PipelineOptions,
  PipelineResult,
  ProgressCallback,
  StepResult,
  PipelineStep,
} from '@shared/pipeline';

// Internal path constants. We resolve relative to `process.cwd()` because
// Nest is always bootstrapped with the backend/ directory as the working
// directory (see `pnpm start:dev` / `pnpm test`).
const BACKEND_ROOT = path.resolve(process.cwd());
const PIPELINE_TMP_DIR = path.join(BACKEND_ROOT, 'tmp', 'pipeline');

/**
 * Lightweight error class. The Controller layer maps this to an HTTP
 * 4xx/5xx via the global `HttpExceptionFilter`; orchestrator-level
 * catches use `instanceof PipelineError` to decide whether to retry
 * or short-circuit.
 */
export class PipelineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}

export interface RunFullPipelineOptions {
  progressCallback?: ProgressCallback;
  signal?: AbortSignal;
}

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    @Inject(BOOK_ADAPTER) private readonly bookAdapter: BookApiAdapter,
    @Inject(LLM_ADAPTER) private readonly llmAdapter: LlmAdapter,
    @Inject(TTS_ADAPTER) private readonly ttsAdapter: TtsAdapter,
    @Inject(STORAGE_ADAPTER) private readonly storageAdapter: StorageAdapter,
  ) {}

  /**
   * Execute the full 4-step pipeline. See module-level docstring for the
   * state-machine contract. Always returns a `PipelineResult` (never
   * throws for step-level failures — those are surfaced via
   * `result.status === 'partial' | 'failed'` and `result.steps[i].error`).
   *
   * The only exceptions that escape are:
   *  - `PipelineError(70001)` when `isbns` is empty (callers SHOULD
   *    pre-validate, but we double-check defensively).
   *  - `PipelineError(70003)` when step 2 throws with a timeout-style
   *    message (caller can react to it).
   *  - `PipelineError(70004)` for ffmpeg failures inside step 3.
   *  - `PipelineError(70005)` when step 4's `storage.put` throws.
   *  - Any other error is wrapped in a generic `Error` with the
   *    original message preserved as `cause`.
   */
  async runFullPipeline(
    input: PipelineInput,
    options: RunFullPipelineOptions = {},
  ): Promise<PipelineResult> {
    const runStart = Date.now();
    const runId = randomUUID();
    const runDir = path.join(PIPELINE_TMP_DIR, runId);
    await fs.mkdir(runDir, { recursive: true });

    this.logger.log(`runFullPipeline start runId=${runId} isbns=${input.isbns.length}`);

    // -- Short-circuit 1: empty ISBN list (architecture §A2.3 row 1) ----
    if (!Array.isArray(input.isbns) || input.isbns.length === 0) {
      const steps: StepResult[] = makeSkippedSteps(runStart);
      this.logger.warn(`runId=${runId} abort: empty isbns (code=70001)`);
      return {
        runId,
        finalMp3Path: null,
        downloadUrl: null,
        steps,
        status: 'failed',
        totalDurationMs: Date.now() - runStart,
      };
    }

    const opts: Required<PipelineOptions> = normaliseOptions(input.options);
    // Wrap the user callback with the per-run monotonic tracker so the
    // emitted `percent` is never lower than the highest value seen
    // earlier in the same run (architecture §A7.5).
    const cb = makeMonotonicProgressCallback(options.progressCallback);

    // -- Step 1: metadata -----------------------------------------------
    const step1Result: StepResult = { step: 1, status: 'failed', durationMs: 0 };
    let step1: Step1Output | null = null;
    try {
      step1 = await runStep1(this.bookAdapter, {
        runId,
        runDir,
        isbns: input.isbns,
        progressCallback: cb,
      });
      step1Result.status = 'success';
      step1Result.durationMs = step1.durationMs;
      step1Result.artifact = step1.artifactPath;
    } catch (e: unknown) {
      step1Result.error = formatError('70002', e);
      step1Result.durationMs = Date.now() - runStart;
      // Step 1 is allowed to fail PER-ISBN; we only reach this catch
      // when the adapter itself is broken (not when a single ISBN
      // misses). Surface as `failed`.
      this.logger.error(`runId=${runId} step 1 adapter threw: ${(e as Error).message}`);
    }

    // Step 1 result: if all ISBNs failed → terminal `failed`. We
    // mark step 1 as `failed` (NOT `success`) here because, per
    // architecture §A2.3 row 2, "步 1 全失败" should surface as a
    // failed step even though the adapter itself didn't throw.
    if (step1Result.status === 'success' && step1!.books.length === 0) {
      step1Result.status = 'failed';
      step1Result.error = '70002: 步 1 全失败（无任何 ISBN 解析成功）';
      const steps: StepResult[] = [
        step1Result,
        ...makeSkippedStepsFrom(2, runStart),
      ];
      this.logger.warn(`runId=${runId} abort: step 1 all failed`);
      return {
        runId,
        finalMp3Path: null,
        downloadUrl: null,
        steps,
        status: 'failed',
        totalDurationMs: Date.now() - runStart,
      };
    }
    if (step1Result.status === 'failed') {
      const steps: StepResult[] = [
        step1Result,
        ...makeSkippedStepsFrom(2, runStart),
      ];
      return {
        runId,
        finalMp3Path: null,
        downloadUrl: null,
        steps,
        status: 'failed',
        totalDurationMs: Date.now() - runStart,
      };
    }

    // We have at least one resolved book → continue.
    const primaryBook = step1!.books[0]!;

    // -- Step 2: script ------------------------------------------------
    const step2Result: StepResult = { step: 2, status: 'failed', durationMs: 0 };
    let step2: Step2Output | null = null;
    try {
      step2 = await runStep2(this.llmAdapter, {
        runId,
        runDir,
        book: primaryBook,
        template: 'default',
        progressCallback: cb,
      });
      step2Result.status = 'success';
      step2Result.durationMs = step2.durationMs;
      step2Result.artifact = step2.artifactPath;
    } catch (e: unknown) {
      const code = (e as Error).message?.toLowerCase().includes('timeout') ? '70003' : '70003';
      step2Result.error = formatError(code, e);
      step2Result.durationMs = Date.now() - runStart;
      this.logger.error(`runId=${runId} step 2 failed: ${(e as Error).message}`);
    }

    if (step2Result.status === 'failed') {
      const steps: StepResult[] = [step1Result, step2Result, ...makeSkippedStepsFrom(3, runStart)];
      return {
        runId,
        finalMp3Path: null,
        downloadUrl: null,
        steps,
        status: 'partial',
        totalDurationMs: Date.now() - runStart,
      };
    }

    // -- Step 3: TTS + mix ---------------------------------------------
    const step3Result: StepResult = { step: 3, status: 'failed', durationMs: 0 };
    let step3: Step3Output | null = null;
    try {
      step3 = await runStep3(this.ttsAdapter, {
        runId,
        runDir,
        segments: step2!.segments,
        bgmVolume: opts.bgmVolume,
        fadeInSec: opts.fadeInSec,
        fadeOutSec: opts.fadeOutSec,
        progressCallback: cb,
      });
      // The step returns `success` even when individual segments
      // failed silently — the FILE was still produced. The orchestrator
      // decides whether the OVERALL run is `partial` based on the
      // `failedSegmentCount` field.
      step3Result.status = 'success';
      step3Result.durationMs = step3.durationMs;
      step3Result.artifact = step3.mixedAudioPath;
    } catch (e: unknown) {
      step3Result.error = formatError('70004', e);
      step3Result.durationMs = Date.now() - runStart;
      this.logger.error(`runId=${runId} step 3 failed: ${(e as Error).message}`);
    }

    if (step3Result.status === 'failed') {
      const steps: StepResult[] = [step1Result, step2Result, step3Result, ...makeSkippedStepsFrom(4, runStart)];
      return {
        runId,
        finalMp3Path: null,
        downloadUrl: null,
        steps,
        status: 'partial',
        totalDurationMs: Date.now() - runStart,
      };
    }

    // -- Step 4: export ------------------------------------------------
    const step4Result: StepResult = { step: 4, status: 'failed', durationMs: 0 };
    let step4: Step4Output | null = null;
    try {
      step4 = await runStep4(this.storageAdapter, {
        runId,
        runDir,
        mixedAudioPath: step3!.mixedAudioPath,
        progressCallback: cb,
      });
      step4Result.status = 'success';
      step4Result.durationMs = step4.durationMs;
      step4Result.artifact = step4.artifactPath;
    } catch (e: unknown) {
      step4Result.error = formatError('70005', e);
      step4Result.durationMs = Date.now() - runStart;
      this.logger.error(`runId=${runId} step 4 failed: ${(e as Error).message}`);
    }

    // Assemble the final result. We have a mixed MP3 from step 3 in
    // EITHER case (success or partial) — so `finalMp3Path` is set
    // whenever step 3 succeeded. `downloadUrl` is set only when step 4
    // also succeeded.
    const finalMp3Path = step3!.mixedAudioPath;
    const downloadUrl = step4Result.status === 'success' ? step4!.downloadUrl : null;
    const hasAnyFailure =
      step1!.failedIsbns.length > 0 ||
      step3!.failedSegmentCount > 0 ||
      step4Result.status === 'failed';

    return {
      runId,
      finalMp3Path,
      downloadUrl,
      steps: [step1Result, step2Result, step3Result, step4Result],
      status: hasAnyFailure ? 'partial' : 'success',
      totalDurationMs: Date.now() - runStart,
    };
  }
}

/** Normalise optional `PipelineOptions` to fully-populated defaults. */
function normaliseOptions(opts: PipelineOptions | undefined): Required<PipelineOptions> {
  return {
    hostVoice: opts?.hostVoice ?? 'mock-host',
    guestVoice: opts?.guestVoice ?? 'mock-guest',
    bgmTrack: opts?.bgmTrack ?? 'silence-1s',
    bgmVolume: clamp(opts?.bgmVolume ?? 50, 0, 100),
    fadeInSec: clamp(opts?.fadeInSec ?? 1, 0, 10),
    fadeOutSec: clamp(opts?.fadeOutSec ?? 1, 0, 10),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function makeSkippedSteps(runStart: number): StepResult[] {
  return [1, 2, 3, 4].map((s) => makeSkippedStep(s as PipelineStep, runStart));
}

function makeSkippedStepsFrom(from: number, runStart: number): StepResult[] {
  const steps: StepResult[] = [];
  for (let s = from; s <= 4; s++) {
    steps.push(makeSkippedStep(s as PipelineStep, runStart));
  }
  return steps;
}

function makeSkippedStep(step: PipelineStep, runStart: number): StepResult {
  return { step, status: 'skipped', durationMs: Date.now() - runStart };
}

/**
 * Format a step error with a 7xxx code prefix. We keep the original
 * message in the result so callers (and the E2E suite) can grep on
 * the error code while still seeing the underlying cause.
 */
function formatError(code: string, cause: unknown): string {
  const msg = cause instanceof Error ? cause.message : String(cause);
  return `${code}: ${msg}`;
}
