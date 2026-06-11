/**
 * PipelineService — 5-case pure unit test (TP3).
 *
 * Strategy:
 *  - Case 1 (happy path): use the REAL mock adapters (they're
 *    already deterministic — see TP2 specs). This exercises the full
 *    state machine end-to-end AND verifies the on-disk artifacts.
 *  - Cases 2..5: use `jest.fn()` stubs for the 4 adapters injected
 *    into the orchestrator. This lets us pin a specific failure at a
 *    specific step and assert the state-machine response without
 *    writing fixture variations of the mocks.
 *
 * The orchestrator is wired up by hand (no Nest `Test.createTestingModule`)
 * because the spec is a pure unit test of `PipelineService.runFullPipeline`
 * — the integration with Nest's DI is covered by the E2E spec in TP5.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PipelineService } from '../src/modules/pipeline/pipeline.service';
import type { BookApiAdapter } from '../src/modules/book/adapters/book-api.adapter';
import type { LlmAdapter } from '../src/modules/script/adapters/llm.adapter';
import type { TtsAdapter } from '../src/modules/tts/adapters/tts.adapter';
import type { StorageAdapter } from '../src/modules/storage/adapters/storage.adapter';

import { MockBookMetadataAdapter } from '../src/modules/book/adapters/mock-book-metadata.adapter';
import { MockScriptGenAdapter } from '../src/modules/script/adapters/mock-script-gen.adapter';
import { MockTtsAdapter } from '../src/modules/tts/adapters/mock-tts.adapter';
import { LocalDiskStorageAdapter } from '../src/modules/export/adapters/local-disk-storage.adapter';

import type { ProgressEvent } from '@shared/pipeline';

// Path to the per-run scratch dir. We resolve relative to the test file
// (`backend/test/...`) so the spec works from any working directory.
const PIPELINE_TMP_ROOT = path.resolve(__dirname, '..', 'tmp', 'pipeline');
// `LocalDiskStorageAdapter` resolves its root relative to `process.cwd()`,
// which under `pnpm test` is `backend/`. The adapter resolves
// `tmp/exports` (NOT `backend/tmp/exports` — that would produce a
// double-nested `backend/backend/tmp/exports/` tree) so we mirror
// that exact path resolution here.
const EXPORTS_TMP_ROOT = path.resolve(process.cwd(), 'tmp', 'exports');

/**
 * Build a `PipelineService` instance with the supplied adapter stubs.
 * `LocalDiskStorageAdapter` is constructed with the same path the
 * production `main.ts` uses (`process.cwd()/backend/tmp/exports`) so
 * step 4 writes to a real location the E2E suite can fetch.
 */
function buildService(opts: {
  book?: Partial<BookApiAdapter>;
  llm?: Partial<LlmAdapter>;
  tts?: Partial<TtsAdapter>;
  storage?: Partial<StorageAdapter>;
}): PipelineService {
  const bookAdapter = (opts.book ?? new MockBookMetadataAdapter()) as BookApiAdapter;
  const llmAdapter = (opts.llm ?? new MockScriptGenAdapter()) as LlmAdapter;
  const ttsAdapter = (opts.tts ?? new MockTtsAdapter()) as TtsAdapter;
  const storageAdapter = (opts.storage ?? new LocalDiskStorageAdapter()) as StorageAdapter;
  return new PipelineService(bookAdapter, llmAdapter, ttsAdapter, storageAdapter);
}

/**
 * Standard pre-test cleanup. We remove the run-specific scratch dir
 * (cases write into `tmp/pipeline/<runId>/`) and any exports the
 * happy-path case created. The `exports/` cleanup is intentionally
 * NOT exhaustive — we only delete files matching the runId that the
 * test will produce. The directory itself is left in place so the
 * 24h-retention acceptance check (PRD §INCR-04) still has data.
 */
function cleanupRun(runId: string): void {
  const dir = path.join(PIPELINE_TMP_ROOT, runId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const exportFile = path.join(EXPORTS_TMP_ROOT, `${runId}.mp3`);
  if (fs.existsSync(exportFile)) {
    try { fs.unlinkSync(exportFile); } catch { /* ignore */ }
  }
}

/**
 * Verify monotonic non-decreasing percent across a list of events.
 * Architecture §A7.5 mandates this assertion.
 */
function assertMonotonicPercent(events: ProgressEvent[]): void {
  for (let i = 1; i < events.length; i++) {
    expect(events[i].percent).toBeGreaterThanOrEqual(events[i - 1]!.percent);
  }
}

/**
 * Verify step field sequence matches the expected (1, 2, 3, 4) order.
 * Caller can pass a custom sequence for partial-flow assertions.
 */
function assertStepSequence(events: ProgressEvent[], expected: number[]): void {
  const actual: number[] = [];
  for (const e of events) {
    if (actual[actual.length - 1] !== e.step) actual.push(e.step);
  }
  expect(actual).toEqual(expected);
}

describe('PipelineService (TP3)', () => {
  describe('case 1 — happy path: all 4 steps succeed, status="success"', () => {
    it('returns success with finalMp3Path set and 4 on-disk artifacts', async () => {
      const svc = buildService({});
      const cb = jest.fn<void, [ProgressEvent]>();
      const result = await svc.runFullPipeline(
        { isbns: ['9787121362200'] },
        { progressCallback: cb },
      );

      try {
        // 1. Top-level status + runId sanity.
        expect(result.status).toBe('success');
        expect(typeof result.runId).toBe('string');
        expect(result.runId.length).toBeGreaterThan(0);

        // 2. Steps array is exactly 4 entries, all success.
        expect(result.steps.length).toBe(4);
        for (let i = 0; i < 4; i++) {
          expect(result.steps[i]!.step).toBe(i + 1);
          expect(result.steps[i]!.status).toBe('success');
        }

        // 3. finalMp3Path is set and the file exists with non-zero size.
        expect(result.finalMp3Path).not.toBeNull();
        const stat = fs.statSync(result.finalMp3Path!);
        expect(stat.size).toBeGreaterThan(0);

        // 4. downloadUrl is set and the file exists.
        expect(result.downloadUrl).not.toBeNull();
        const exportPath = path.join(EXPORTS_TMP_ROOT, `${result.runId}.mp3`);
        expect(fs.existsSync(exportPath)).toBe(true);
        const exportStat = fs.statSync(exportPath);
        expect(exportStat.size).toBeGreaterThan(0);

        // 5. The 4 step artifacts all exist on disk.
        const runDir = path.join(PIPELINE_TMP_ROOT, result.runId);
        expect(fs.existsSync(path.join(runDir, '01-metadata.json'))).toBe(true);
        expect(fs.existsSync(path.join(runDir, '02-script.json'))).toBe(true);
        expect(fs.existsSync(path.join(runDir, '03-mixed.mp3'))).toBe(true);
        expect(fs.existsSync(path.join(runDir, '04-exported.mp3'))).toBe(true);

        // 6. Progress callback invariants.
        const events = cb.mock.calls.map((c) => c[0] as ProgressEvent);
        expect(events.length).toBeGreaterThanOrEqual(8);
        assertMonotonicPercent(events);
        assertStepSequence(events, [1, 2, 3, 4]);

        // 7. Total duration is sane (>= 0).
        expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
      } finally {
        cleanupRun(result.runId);
      }
    });
  });

  describe('case 2 — step 1 all ISBNs fail → status="failed"', () => {
    it('marks step 1 failed, steps 2/3/4 skipped, finalMp3Path=null', async () => {
      // MockBookMetadataAdapter returns null for any ISBN not in the
      // fixture. We pass 3 unknown ISBNs so ALL of them fail.
      const svc = buildService({});
      const cb = jest.fn<void, [ProgressEvent]>();
      const result = await svc.runFullPipeline(
        { isbns: ['9999999999991', '9999999999992', '9999999999993'] },
        { progressCallback: cb },
      );

      try {
        expect(result.status).toBe('failed');
        expect(result.finalMp3Path).toBeNull();
        expect(result.downloadUrl).toBeNull();

        expect(result.steps.length).toBe(4);
        expect(result.steps[0]!.step).toBe(1);
        expect(result.steps[0]!.status).toBe('failed');
        expect(result.steps[0]!.error).toMatch(/70002/);

        // Steps 2/3/4 all skipped.
        expect(result.steps[1]!.status).toBe('skipped');
        expect(result.steps[2]!.status).toBe('skipped');
        expect(result.steps[3]!.status).toBe('skipped');

        // No 03-mixed.mp3 or 04-exported.mp3 should have been written.
        const runDir = path.join(PIPELINE_TMP_ROOT, result.runId);
        expect(fs.existsSync(path.join(runDir, '01-metadata.json'))).toBe(true);
        expect(fs.existsSync(path.join(runDir, '03-mixed.mp3'))).toBe(false);
      } finally {
        cleanupRun(result.runId);
      }
    });
  });

  describe('case 3 — step 2 fails → status="partial"', () => {
    it('marks step 2 failed, steps 3/4 skipped, finalMp3Path=null', async () => {
      const bookAdapter: Partial<BookApiAdapter> = {
        fetchByIsbn: jest.fn(async (isbn: string) => ({
          isbn,
          title: 'fake-book',
          author: 'fake-author',
          coverUrl: 'https://example.com/cover.jpg',
          summary: 'a long enough summary for the mock to accept it as valid input',
          source: 'mock' as const,
        })),
      };
      const llmAdapter: Partial<LlmAdapter> = {
        generateScript: jest.fn(async () => {
          throw new Error('SCRIPT_EMPTY_BOOK: 模拟脚本生成失败');
        }),
      };
      const svc = buildService({ book: bookAdapter, llm: llmAdapter });
      const cb = jest.fn<void, [ProgressEvent]>();
      const result = await svc.runFullPipeline(
        { isbns: ['1234567890123'] },
        { progressCallback: cb },
      );

      try {
        expect(result.status).toBe('partial');
        expect(result.finalMp3Path).toBeNull();
        expect(result.downloadUrl).toBeNull();

        expect(result.steps[0]!.status).toBe('success');
        expect(result.steps[1]!.status).toBe('failed');
        expect(result.steps[1]!.error).toMatch(/70003/);
        expect(result.steps[2]!.status).toBe('skipped');
        expect(result.steps[3]!.status).toBe('skipped');

        // Step 1's artifact IS on disk even though the run is partial.
        const runDir = path.join(PIPELINE_TMP_ROOT, result.runId);
        expect(fs.existsSync(path.join(runDir, '01-metadata.json'))).toBe(true);
        expect(fs.existsSync(path.join(runDir, '02-script.json'))).toBe(false);
        expect(fs.existsSync(path.join(runDir, '03-mixed.mp3'))).toBe(false);
      } finally {
        cleanupRun(result.runId);
      }
    });
  });

  describe('case 4 — step 3 single-segment TTS fails → status="partial"', () => {
    it('still produces finalMp3Path (silence-fallback), status="partial"', async () => {
      // Book adapter returns a valid book so step 1 succeeds.
      const bookAdapter: Partial<BookApiAdapter> = {
        fetchByIsbn: jest.fn(async (isbn: string) => ({
          isbn,
          title: 'fake-book',
          author: 'fake-author',
          coverUrl: 'https://example.com/cover.jpg',
          summary: 'a long enough summary for the mock to accept it as valid input',
          source: 'mock' as const,
        })),
      };
      // LLM adapter returns 12 valid segments (we don't really need them
      // to be semantically correct — the orchestrator just passes them
      // through to step 3).
      const llmAdapter: Partial<LlmAdapter> = {
        generateScript: jest.fn(async () =>
          Array.from({ length: 12 }, (_, i) => ({
            id: `seg-${i}`,
            scriptId: 'mock',
            orderIndex: i,
            speaker: (i % 2 === 0 ? 'host' : 'guest') as 'host' | 'guest',
            text: `测试段 ${i}`,
            emotion: '平和' as const,
            stage: 'intro' as const,
          })),
        ),
      };
      // TTS adapter succeeds 11 times and throws on the 12th call.
      // The orchestrator must catch this and use a silence fallback.
      const silenceBuffer = fs.readFileSync(
        path.resolve(__dirname, '..', 'src', 'test', 'fixtures', 'silence-1s.mp3'),
      );
      let callCount = 0;
      const ttsAdapter: Partial<TtsAdapter> = {
        synthesize: jest.fn(async () => {
          callCount += 1;
          if (callCount === 12) {
            throw new Error('TTS backend rate-limited');
          }
          return { buffer: silenceBuffer, durationMs: 1000 };
        }),
      };

      const svc = buildService({ book: bookAdapter, llm: llmAdapter, tts: ttsAdapter });
      const cb = jest.fn<void, [ProgressEvent]>();
      const result = await svc.runFullPipeline(
        { isbns: ['1234567890123'] },
        { progressCallback: cb },
      );

      try {
        expect(result.status).toBe('partial');
        // finalMp3Path is NOT null because step 3 produced a file.
        expect(result.finalMp3Path).not.toBeNull();
        expect(fs.existsSync(result.finalMp3Path!)).toBe(true);

        // Step 3 still marked `success` at the orchestrator level
        // (the file was produced; the failure is captured in the
        // step-3 internal `failedSegmentCount`).
        expect(result.steps[2]!.status).toBe('success');

        // The mixed MP3 contains 12 segments worth of audio (11 real
        // + 1 silence fallback) so its size is non-trivial.
        const stat = fs.statSync(result.finalMp3Path!);
        expect(stat.size).toBeGreaterThan(0);
      } finally {
        cleanupRun(result.runId);
      }
    });
  });

  describe('case 5 — step 4 fails → status="partial"', () => {
    it('marks step 4 failed, finalMp3Path set (from step 3) but downloadUrl=null', async () => {
      const bookAdapter: Partial<BookApiAdapter> = {
        fetchByIsbn: jest.fn(async (isbn: string) => ({
          isbn,
          title: 'fake-book',
          author: 'fake-author',
          coverUrl: 'https://example.com/cover.jpg',
          summary: 'a long enough summary for the mock to accept it as valid input',
          source: 'mock' as const,
        })),
      };
      const llmAdapter: Partial<LlmAdapter> = {
        generateScript: jest.fn(async () =>
          Array.from({ length: 12 }, (_, i) => ({
            id: `seg-${i}`,
            scriptId: 'mock',
            orderIndex: i,
            speaker: (i % 2 === 0 ? 'host' : 'guest') as 'host' | 'guest',
            text: `测试段 ${i}`,
            emotion: '平和' as const,
            stage: 'intro' as const,
          })),
        ),
      };
      const silenceBuffer = fs.readFileSync(
        path.resolve(__dirname, '..', 'src', 'test', 'fixtures', 'silence-1s.mp3'),
      );
      const ttsAdapter: Partial<TtsAdapter> = {
        synthesize: jest.fn(async () => ({ buffer: silenceBuffer, durationMs: 1000 })),
      };
      // Storage adapter throws on put (simulates permission denied /
      // disk full / etc).
      const storageAdapter: Partial<StorageAdapter> = {
        put: jest.fn(async () => {
          throw new Error('EACCES: permission denied');
        }),
        publicUrl: jest.fn((key: string) => `/exports/${key}`),
      };

      const svc = buildService({ book: bookAdapter, llm: llmAdapter, tts: ttsAdapter, storage: storageAdapter });
      const cb = jest.fn<void, [ProgressEvent]>();
      const result = await svc.runFullPipeline(
        { isbns: ['1234567890123'] },
        { progressCallback: cb },
      );

      try {
        expect(result.status).toBe('partial');
        // Step 3 produced a file, so finalMp3Path is set.
        expect(result.finalMp3Path).not.toBeNull();
        expect(fs.existsSync(result.finalMp3Path!)).toBe(true);
        // Step 4 failed → no downloadUrl.
        expect(result.downloadUrl).toBeNull();

        expect(result.steps[3]!.step).toBe(4);
        expect(result.steps[3]!.status).toBe('failed');
        expect(result.steps[3]!.error).toMatch(/70005/);
      } finally {
        cleanupRun(result.runId);
      }
    });
  });
});
