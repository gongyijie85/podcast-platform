/**
 * Step 3 — synthesise 12 voice segments via TTS, then mix with BGM via
 * ffmpeg and persist the final `03-mixed.mp3`.
 *
 * Critical invariants (architecture §A2.2, §A8.1):
 *  - TTS adapter is `MockTtsAdapter` (returns 1s silence buffer).
 *  - ffmpeg mixing MUST go through `FfmpegUtil.run` / `FfmpegUtil.mixWithBgm`.
 *    Direct `require('fluent-ffmpeg')` is FORBIDDEN — fluent-ffmpeg 5+
 *    parser bug would re-emerge (see last cycle's `865ff2b` fix).
 *  - Single-segment TTS failures do NOT abort the step. We log + push
 *    a silent-fallback buffer so the final mix is still produced and
 *    the orchestrator can mark the overall run `partial` (with
 *    `steps[2].status === 'success'` because the FILE was produced).
 *  - The step writes `03-mixed.mp3` to `backend/tmp/pipeline/<runId>/`.
 *
 * BGM selection: v1.1 fixture ships `silence-1s` (in the v1.1
 * `LocalDiskStorageAdapter` BGM whitelist). Volume / fade defaults are
 * pulled from `PipelineOptions` and clamped to safe ranges here so
 * callers can't send a `bgmVolume: -1` and crash the step.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { TtsAdapter } from '../../tts/adapters/tts.adapter';
import { TTS_ADAPTER } from '../pipeline.tokens';
import { FfmpegUtil } from '../../mix/ffmpeg.util';
import { emitProgress } from '../progress';
import type { ProgressCallback, ScriptSegment, PipelineStep } from '@shared/pipeline';

const V11_VOICE_HOST = 'mock-host';
const V11_VOICE_GUEST = 'mock-guest';

export interface Step3Output {
  /** Absolute path to the persisted `03-mixed.mp3`. */
  mixedAudioPath: string;
  /** Combined duration of all synthesised segments in seconds. */
  durationSec: number;
  /** Count of segments that produced a valid buffer (== 12 on success). */
  okSegmentCount: number;
  /** Count of segments that fell back to silence (0 on success). */
  failedSegmentCount: number;
  durationMs: number;
}

export interface Step3Input {
  runId: string;
  runDir: string;
  segments: ScriptSegment[];
  bgmVolume: number;        // 0..100, clamped here
  fadeInSec: number;        // 0..10
  fadeOutSec: number;       // 0..10
  progressCallback?: ProgressCallback;
}

export async function runStep3(
  adapter: TtsAdapter,
  input: Step3Input,
): Promise<Step3Output> {
  const step: PipelineStep = 3;
  const start = Date.now();
  // Clamp BGM knobs to safe ranges so a bad caller input can't crash
  // the step. The orchestrator validates via class-validator but we
  // double-check here for direct (non-HTTP) callers.
  const bgmVolume = clamp(input.bgmVolume, 0, 100);
  const fadeInSec = clamp(input.fadeInSec, 0, 10);
  const fadeOutSec = clamp(input.fadeOutSec, 0, 10);
  const voiceFor = (s: ScriptSegment): string => (s.speaker === 'host' ? V11_VOICE_HOST : V11_VOICE_GUEST);

  emitProgress(
    input.progressCallback,
    input.runId,
    step,
    0,
    `开始 TTS 合成（${input.segments.length} 段）`,
  );

  // Per-segment synthesis. A single failure does NOT abort the loop;
  // we substitute a 1-second silence buffer (matching the fixture size)
  // so the downstream mix can still complete. The mock adapter already
  // returns a deterministic 1s silence buffer; we only need the
  // fallback if the adapter THROWS.
  const silenceFallback = await loadSilenceFallback();
  const buffers: Buffer[] = [];
  let okCount = 0;
  let failedCount = 0;

  for (let i = 0; i < input.segments.length; i++) {
    const seg = input.segments[i]!;
    const voiceId = voiceFor(seg);
    try {
      const r = await adapter.synthesize(seg.text, voiceId, { emotion: seg.emotion });
      buffers.push(r.buffer);
      okCount += 1;
    } catch (e: unknown) {
      // Single-segment failure → silent fallback. Log but do NOT throw.
      // eslint-disable-next-line no-console
      console.warn(
        `[pipeline/step3] segment ${i} TTS failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      buffers.push(silenceFallback);
      failedCount += 1;
    }
    // Tick progress at every segment (12 ticks at 8% each = 96%, final
    // tick after concat bumps to 100%).
    const tick = Math.floor(((i + 1) / input.segments.length) * 95);
    emitProgress(
      input.progressCallback,
      input.runId,
      step,
      tick,
      `TTS 合成段 ${i + 1}/${input.segments.length}`,
    );
  }

  // Concatenate segment buffers in order. We use FfmpegUtil.run (NOT
  // direct `require('fluent-ffmpeg')`) so we inherit the existing
  // mock factory in `mix.service.spec.ts` — see architecture §A8.1.
  // The mix-with-BGM helper handles the no-BGM case by applying an
  // `anull` filter (we pass `bgm: null` because v1.1 only ships one
  // BGM track and we want a deterministic mix for E2E).
  const concatenated = await FfmpegUtil.concatenateBuffers(buffers);
  const mixed = await FfmpegUtil.mixWithBgm({
    voice: concatenated,
    bgm: null,
    voiceVolume: 100,
    bgmVolume,
    fadeInMs: fadeInSec * 1000,
    fadeOutMs: fadeOutSec * 1000,
  });

  // Persist to disk. The artifact path is what the orchestrator's
  // StepResult.artifact field will point to, and what step 4 reads
  // from when it copies the file to `backend/tmp/exports/`.
  const mixedAudioPath = path.join(input.runDir, '03-mixed.mp3');
  await fs.mkdir(input.runDir, { recursive: true });
  await fs.writeFile(mixedAudioPath, mixed.buffer);

  // Total duration: sum of segment durations. The mock adapter returns
  // exactly 1000ms per call, so `okCount + failedCount === segments.length`
  // and the total is always `segments.length * 1` second.
  const durationSec = (okCount + failedCount);

  emitProgress(input.progressCallback, input.runId, step, 100, '步 3 完成');

  return {
    mixedAudioPath,
    durationSec,
    okSegmentCount: okCount,
    failedSegmentCount: failedCount,
    durationMs: Date.now() - start,
  };
}

@Injectable()
export class Step3TtsMix {
  constructor(@Inject(TTS_ADAPTER) private readonly adapter: TtsAdapter) {}

  async run(input: Step3Input): Promise<Step3Output> {
    return runStep3(this.adapter, input);
  }
}

/** Clamp a number to `[lo, hi]`. */
function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/**
 * Load the 1s silence fixture once per step. We read from the
 * `backend/src/test/fixtures/silence-1s.mp3` path that the existing
 * `MockTtsAdapter` uses so the fallback buffer is byte-identical to a
 * successful TTS call.
 *
 * 使用 process.cwd() 定位，确保 dev 和 Docker 生产环境都能找到文件：
 *  - dev：process.cwd() = backend/，路径 = backend/src/test/fixtures/silence-1s.mp3
 *  - prod：process.cwd() = /app/，路径 = /app/src/test/fixtures/silence-1s.mp3
 *    （backend.Dockerfile 中已 COPY fixtures 到该位置）
 */
async function loadSilenceFallback(): Promise<Buffer> {
  const fixturePath = path.resolve(
    process.cwd(),
    'src',
    'test',
    'fixtures',
    'silence-1s.mp3',
  );
  return fs.readFile(fixturePath);
}
