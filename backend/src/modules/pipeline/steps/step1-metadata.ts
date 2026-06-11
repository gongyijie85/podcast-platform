/**
 * Step 1 — fetch & resolve book metadata for the supplied ISBNs.
 *
 * Source-of-truth adapter is `MockBookMetadataAdapter` (v1.1 increment),
 * which is bound to the `BOOK_ADAPTER` token in `PipelineModule`. The
 * adapter takes one network round-trip per ISBN so the parent service
 * can push per-ISBN progress events (50% per resolved ISBN).
 *
 * Output invariants (architecture §A2.2):
 *  - `books.length + failedIsbns.length === isbns.length`
 *  - Invalid ISBNs do NOT throw; they are recorded in `failedIsbns`.
 *  - Caller is responsible for picking the first successful book (we
 *    return the full list so the orchestrator can also surface counts
 *    in the `StepResult`).
 *
 * Filesystem: writes `01-metadata.json` containing the full per-ISBN
 * resolution trace to `backend/tmp/pipeline/<runId>/`.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { BookApiAdapter } from '../../book/adapters/book-api.adapter';
import type { BookMetadata } from '@shared/book';
import { BOOK_ADAPTER } from '../pipeline.tokens';
import { emitProgress } from '../progress';
import type { ProgressCallback, PipelineStep } from '@shared/pipeline';

export interface Step1Output {
  /** Successfully resolved books (preserves input order). */
  books: BookMetadata[];
  /** ISBNs that could not be resolved (preserve input order). */
  failedIsbns: string[];
  /** Absolute path to the persisted `01-metadata.json` artifact. */
  artifactPath: string;
  /** Wall-clock duration of the step in ms. */
  durationMs: number;
}

export interface Step1Input {
  runId: string;
  runDir: string;
  isbns: string[];
  progressCallback?: ProgressCallback;
}

/**
 * The raw `BookApiAdapter.fetchBatch` contract returns `BookMetadata[]`
 * with `null` slots for misses; we widen the public type to `Array<BookMetadata | null>`
 * so the call site can match nulls against ISBNs.
 */
type RawFetchResult = Array<BookMetadata | null>;

/**
 * Standalone function form (architecture §A1.4 calls these "inline step
 * functions"). Tests can import this directly without spinning up Nest.
 */
export async function runStep1(
  adapter: BookApiAdapter,
  input: Step1Input,
): Promise<Step1Output> {
  const step: PipelineStep = 1;
  const start = Date.now();
  emitProgress(input.progressCallback, input.runId, step, 0, `开始解析 ${input.isbns.length} 个 ISBN`);

  // Defensive: empty input short-circuits to an empty result. The
  // orchestrator checks for this case separately and marks the whole
  // run as `failed` (70001), but we still produce a valid artifact so
  // the downstream `failedIsbns` count is consistent.
  if (input.isbns.length === 0) {
    const empty: Step1Output = {
      books: [],
      failedIsbns: [],
      artifactPath: '',
      durationMs: Date.now() - start,
    };
    return empty;
  }

  // Per-ISBN fan-out so the adapter (mock or real) is responsible for
  // its own batching strategy. We issue one `fetchByIsbn` per ISBN to
  // preserve per-ISBN progress granularity.
  const resolved: RawFetchResult = [];
  for (let i = 0; i < input.isbns.length; i++) {
    const isbn = input.isbns[i]!;
    const book = await adapter.fetchByIsbn(isbn);
    resolved.push(book);
    // Push a midpoint progress event after each ISBN (0..100 inclusive).
    // We space the per-ISBN ticks across the 0..100 range so a long
    // ISBN list still shows smooth progression; for short lists the
    // difference between consecutive ticks is at most 100/len.
    const tick = Math.floor(((i + 1) / input.isbns.length) * 100);
    emitProgress(
      input.progressCallback,
      input.runId,
      step,
      tick,
      `解析 ISBN ${i + 1}/${input.isbns.length}`,
    );
  }

  // Split into success / failure buckets while preserving input order.
  const books: BookMetadata[] = [];
  const failedIsbns: string[] = [];
  resolved.forEach((b, idx) => {
    const isbn = input.isbns[idx]!;
    if (b) books.push(b);
    else failedIsbns.push(isbn);
  });

  // Persist the resolution trace for downstream steps and the E2E
  // suite to inspect.
  const artifactPath = path.join(input.runDir, '01-metadata.json');
  await fs.mkdir(input.runDir, { recursive: true });
  const artifact = {
    runId: input.runId,
    total: input.isbns.length,
    resolvedCount: books.length,
    failedCount: failedIsbns.length,
    books,
    failedIsbns,
  };
  await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');

  emitProgress(input.progressCallback, input.runId, step, 100, '步 1 完成');

  return {
    books,
    failedIsbns,
    artifactPath,
    durationMs: Date.now() - start,
  };
}

/**
 * NestJS-injectable wrapper. The orchestrator prefers the standalone
 * `runStep1` for testability, but `@Injectable` makes the step available
 * to any other Nest consumer that wants to swap it out.
 */
@Injectable()
export class Step1Metadata {
  constructor(@Inject(BOOK_ADAPTER) private readonly adapter: BookApiAdapter) {}

  async run(input: Step1Input): Promise<Step1Output> {
    return runStep1(this.adapter, input);
  }
}
