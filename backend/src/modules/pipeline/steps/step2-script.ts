/**
 * Step 2 — generate the 6-stage × 2-line script for the first
 * successfully-resolved book from step 1.
 *
 * Source-of-truth adapter is `MockScriptGenAdapter` (v1.1 increment),
 * bound to the `LLM_ADAPTER` token. The adapter takes a single
 * `ScriptGenerationContext` and returns 12 `ScriptSegmentDto`s.
 *
 * Step inputs:
 *  - `book` (a single `BookMetadata`) — orchestrator picks the first
 *    successful book from step 1. We never call the adapter with an
 *    empty book list (the orchestrator short-circuits the whole run
 *    to `failed` when step 1 has no resolved books).
 *
 * Step outputs:
 *  - `segments` normalised to the v1.1 `ScriptSegment` shape (5
 *    emotion values only, 6 fixed stages) and persisted as
 *    `02-script.json`.
 *  - `totalChars` / `estimatedDurationSec` for downstream logging.
 *
 * Failure semantics: a thrown `SCRIPT_EMPTY_BOOK` (or any other error
 * from the adapter) propagates up to the orchestrator, which marks
 * step 2 `failed` and sets the overall run to `partial`. We do NOT
 * swallow errors here — that would hide the failure from logs.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { LlmAdapter } from '../../script/adapters/llm.adapter';
import type { ScriptSegmentDto } from '@shared/script';
import { LLM_ADAPTER } from '../pipeline.tokens';
import { emitProgress } from '../progress';
import type { ProgressCallback, ScriptSegment, PipelineStep } from '@shared/pipeline';

// We intentionally import the v1.0 `BookMetadata` from `@shared/book` (NOT
// the `PipelineBookMetadata` shadow type in `@shared/pipeline`) because the
// `LlmAdapter` interface accepts v1.0's `BookMetadata`. The shapes are
// structurally identical, but using the v1.0 symbol keeps `tsc` happy.
import type { BookMetadata as V10BookMetadata } from '@shared/book';

/**
 * The 5 v1.1 emotions, mirroring `shared/types/pipeline.ts`. Used to
 * validate the adapter's output and to filter stray values that may
 * leak through the legacy emotion mapping in `MockScriptGenAdapter`.
 */
const V11_EMOTIONS = ['开心', '沉思', '激昂', '平和', '感慨'] as const;
type V11Emotion = (typeof V11_EMOTIONS)[number];

/**
 * Map v1.0 `ScriptStage` to v1.1 `ScriptSegment.stage`. The adapter
 * returns v1.0 names (`intro`/`introduce`/`interpret`/`review`/`suggest`/`closing`).
 * The pipeline DTO and the v1.1 spec require v1.1 names (`opening`/`intro`/
 * `interpret`/`review`/`suggest`/`closing`).
 */
const V10_TO_V11_STAGE: Record<string, ScriptSegment['stage']> = {
  intro: 'opening',
  introduce: 'intro',
  interpret: 'interpret',
  review: 'review',
  suggest: 'suggest',
  closing: 'closing',
};

export interface Step2Output {
  segments: ScriptSegment[];
  totalChars: number;
  estimatedDurationSec: number;
  artifactPath: string;
  durationMs: number;
}

export interface Step2Input {
  runId: string;
  runDir: string;
  book: V10BookMetadata;
  progressCallback?: ProgressCallback;
  /** The adapter-level template switch; defaults to `'default'`. */
  template?: 'default' | 'merge';
}

export async function runStep2(
  adapter: LlmAdapter,
  input: Step2Input,
): Promise<Step2Output> {
  const step: PipelineStep = 2;
  const start = Date.now();
  emitProgress(input.progressCallback, input.runId, step, 0, `生成脚本（书名：${input.book.title}）`);

  // Build the adapter-level context. We map v1.0's `BookMetadata` shape
  // onto the v1.0 `ScriptGenerationContext` (no transformation needed —
  // both come from `@shared/book` and `@shared/script`).
  const ctx = {
    projectId: input.runId,
    books: [input.book] as V10BookMetadata[],
    mode: 'independent' as const,
    template: input.template === 'merge' ? ('merge' as const) : ('standard' as const),
    title: input.book.title,
  };
  const rawSegments: ScriptSegmentDto[] = await adapter.generateScript(ctx);

  // Normalise to v1.1 shapes: stage labels, emotion whitelist,
  // monotonically-increasing `orderIndex`.
  const segments: ScriptSegment[] = rawSegments
    .map((seg, idx) => {
      const emotion: V11Emotion = (V11_EMOTIONS as readonly string[]).includes(seg.emotion)
        ? (seg.emotion as V11Emotion)
        : '平和';
      const stage = V10_TO_V11_STAGE[seg.stage] ?? 'intro';
      return {
        stage,
        speaker: seg.speaker,
        text: seg.text,
        emotion,
        orderIndex: idx,
      };
    })
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((seg, idx) => ({ ...seg, orderIndex: idx }));

  const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);
  // Rough estimate: 3 characters per second of speech (Mandarin
  // average). The fixture estimates 600 chars → 120s, so 5 chars/sec
  // is closer to the fixture's value. We pick 4 to round up.
  const estimatedDurationSec = Math.max(1, Math.round(totalChars / 4));

  const artifactPath = path.join(input.runDir, '02-script.json');
  await fs.mkdir(input.runDir, { recursive: true });
  const artifact = {
    runId: input.runId,
    book: { isbn: input.book.isbn, title: input.book.title, author: input.book.author },
    segments,
    totalChars,
    estimatedDurationSec,
  };
  await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');

  emitProgress(input.progressCallback, input.runId, step, 100, '步 2 完成');

  return {
    segments,
    totalChars,
    estimatedDurationSec,
    artifactPath,
    durationMs: Date.now() - start,
  };
}

@Injectable()
export class Step2Script {
  constructor(@Inject(LLM_ADAPTER) private readonly adapter: LlmAdapter) {}

  async run(input: Step2Input): Promise<Step2Output> {
    return runStep2(this.adapter, input);
  }
}
