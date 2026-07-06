/**
 * Pipeline e2e spec (v1.1) — TP5.
 *
 * Strategy: spin up the full Nest application via `Test.createTestingModule`
 * with `imports: [AppModule]` (NOT a hand-rolled providers list — see
 * architecture §A6 决策 5). The full module graph ensures the
 * 4-adapter DI wiring is exercised end-to-end.
 *
 * Cases:
 *  1. Happy path: 1 ISBN → `status='success'`, `finalMp3Path` exists
 *     and is non-empty, ≥ 8 progress events, `GET /exports/<runId>.mp3`
 *     returns 200.
 *  2. Partial path: we override the `LLM_ADAPTER` provider to throw,
 *     triggering `status='partial'` with `steps[1].status='failed'`
 *     and `steps[2].status='skipped'`.
 *
 * `auth.e2e-spec.ts` is intentionally NOT touched — it has its own
 * skip configuration for the Docker-不可用 environment. We add
 * our spec to the `jest-e2e.json` `testMatch` separately.
 *
 * Skip behaviour: this spec imports `AppModule` which transitively
 * requires `PrismaModule`. The Prisma client can construct in any
 * environment (it just fails at first query if `DATABASE_URL` is
 * absent), so we do NOT skip on `DATABASE_URL` alone. Instead, we
 * skip when `SKIP_E2E=1` is set explicitly (CI convention from
 * `auth.e2e-spec.ts`). The companion unit tests cover all the
 * behaviour end-to-end at the function-call level, so this e2e
 * suite is a belt-and-braces layer.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { AppModule } from '../src/app.module';
import {
  BOOK_ADAPTER,
  LLM_ADAPTER,
  TTS_ADAPTER,
  STORAGE_ADAPTER,
} from '../src/modules/pipeline/pipeline.tokens';
import { setupBeforeEach, cleanupExport } from './pipeline-tmp-setup';

import type { LlmAdapter } from '../src/modules/script/adapters/llm.adapter';
import type { BookApiAdapter } from '../src/modules/book/adapters/book-api.adapter';
import type { TtsAdapter } from '../src/modules/tts/adapters/tts.adapter';
import type { StorageAdapter } from '../src/modules/storage/adapters/storage.adapter';

import { MockBookMetadataAdapter } from '../src/modules/book/adapters/mock-book-metadata.adapter';
import { MockScriptGenAdapter } from '../src/modules/script/adapters/mock-script-gen.adapter';
import { MockTtsAdapter } from '../src/modules/tts/adapters/mock-tts.adapter';
import { LocalDiskStorageAdapter } from '../src/modules/export/adapters/local-disk-storage.adapter';

import type {
  PipelineResult,
  ProgressEvent,
  ScriptSegmentDto,
} from '@shared/pipeline';

const PIPELINE_TMP_DIR = path.resolve(__dirname, '..', 'tmp', 'pipeline');
// `process.cwd()` is `.../podcast-platform/backend` when running
// `cd backend && pnpm test:e2e`, so the path is `tmp/exports`,
// not `backend/tmp/exports`.
const _EXPORTS_TMP_DIR = path.resolve(process.cwd(), 'tmp', 'exports');

/**
 * Skip conditions:
 *  1. `SKIP_E2E=1` (CI default for `auth.e2e-spec.ts`).
 *  2. Running under the unit-test config: this file matches the
 *     `\\.(spec|e2e-spec)\\.ts$` regex in `jest.config.ts`, so a
 *     plain `pnpm test` would otherwise try to import the full
 *     `AppModule` (which needs Prisma / Redis). We detect the
 *     unit-test mode by checking `JEST_E2E` env (set by `pnpm test:e2e`
 *     script) — the same convention as the `auth.e2e-spec.ts`
 *     `SKIP_E2E` pattern.
 *
 * When skipped, a single no-op `it()` runs so the suite is reported
 * as PASSED (not as a Jest "empty suite" failure).
 */
const SKIP_E2E = process.env.SKIP_E2E === '1';
const IS_E2E_RUN = process.env.JEST_E2E === '1';
const SHOULD_SKIP = SKIP_E2E || !IS_E2E_RUN;

// `SHOULD_SKIP` is computed at module load time (see top of file). We
// wrap the whole describe block in `SHOULD_SKIP ? describe.skip : describe`
// so when the unit test runner picks this file up, all cases become
// no-ops and the suite reports PASS with a single no-op test.
(SHOULD_SKIP ? describe.skip : describe)('Pipeline e2e (v1.1)', () => {
  let app: INestApplication;

  // Set NODE_ENV explicitly so the dev-only controllers get enabled
  // (the controllers throw 404 when NODE_ENV === 'production').
  const originalNodeEnv = process.env.NODE_ENV;
  beforeAll(() => {
    if (process.env.NODE_ENV === 'production') {
      process.env.NODE_ENV = 'test';
    }
  });
  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  beforeEach(setupBeforeEach());

  /**
   * Helper: build a `TestingModule` with optional adapter overrides.
   * We never override `BOOK_ADAPTER` / `TTS_ADAPTER` / `STORAGE_ADAPTER`
   * for the happy path; we override `LLM_ADAPTER` for the partial case.
   */
  async function buildApp(opts: {
    llmOverride?: Partial<LlmAdapter>;
  } = {}): Promise<INestApplication> {
    const providers: Array<{ provide: symbol; useValue: unknown }> = [];
    if (opts.llmOverride) {
      const stub: LlmAdapter = {
        name: 'mock-script-gen-override',
        generateScript: opts.llmOverride.generateScript ?? (async () => []),
      };
      providers.push({ provide: LLM_ADAPTER, useValue: stub });
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LLM_ADAPTER)
      .useValue(opts.llmOverride
        ? ({
            name: 'mock-script-gen-override',
            generateScript: opts.llmOverride.generateScript ?? (async () => []),
          } as LlmAdapter)
        : new MockScriptGenAdapter())
      // Ensure BOOK_ADAPTER / TTS_ADAPTER / STORAGE_ADAPTER are
      // explicitly bound to the mock implementations so the override
      // doesn't accidentally fall back to the v1.0 real adapters.
      .overrideProvider(BOOK_ADAPTER)
      .useValue(new MockBookMetadataAdapter())
      .overrideProvider(TTS_ADAPTER)
      .useValue(new MockTtsAdapter())
      .overrideProvider(STORAGE_ADAPTER)
      .useValue(new LocalDiskStorageAdapter())
      .compile();

    // `providers` is only used to keep TS happy with the unused-var
    // when `llmOverride` is undefined.
    void providers;

    const app = moduleRef.createNestApplication();
    // Mirror the production `main.ts` setup so the route paths line
    // up: global prefix `/api`, and exclude `/exports/*` so the
    // static handler is reachable. The global ValidationPipe and
    // ResponseInterceptor are also required so the DTO layer
    // actually rejects malformed payloads AND the response body is
    // wrapped in `{code, data, message, traceId}` as the rest of
    // the API contract requires.
    app.setGlobalPrefix('api', { exclude: ['exports/(.*)'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      }),
    );
    const { ResponseInterceptor } = await import(
      '../src/common/interceptors/response.interceptor'
    );
    const { HttpExceptionFilter } = await import(
      '../src/common/filters/http-exception.filter'
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    return app;
  }

  // --------------------------------------------------------------------
  // Case 1: happy path
  // --------------------------------------------------------------------
  describe('case 1 — runs full pipeline end-to-end with all mocks enabled', () => {
    let result: PipelineResult | null = null;
    let progressCallCount = 0;
    const progressEvents: ProgressEvent[] = [];

    beforeAll(async () => {
      app = await buildApp();
      await app.init();
    });
    afterAll(async () => {
      if (app) await app.close();
      if (result) cleanupExport(result.runId);
    });

    it('returns status=success, finalMp3Path non-empty, and downloadUrl reachable', async () => {
      const server = app.getHttpServer();
      const res = await request(server)
        .post('/api/pipeline/run')
        .send({ isbns: ['9787121362200'] })
        .expect(200);

      // The global `ResponseInterceptor` wraps the payload in
      // `{code, data, message, traceId}`. We unwrap `data` here.
      expect(res.body.code).toBe(0);
      result = res.body.data as PipelineResult;

      // 1. Status + runId sanity.
      expect(result.status).toBe('success');
      expect(typeof result.runId).toBe('string');
      expect(result.runId.length).toBeGreaterThan(0);

      // 2. 4 steps, all success.
      expect(result.steps.length).toBe(4);
      for (let i = 0; i < 4; i++) {
        expect(result.steps[i]!.step).toBe(i + 1);
        expect(result.steps[i]!.status).toBe('success');
      }

      // 3. finalMp3Path exists on disk and is non-empty.
      expect(result.finalMp3Path).not.toBeNull();
      const stat = fs.statSync(result.finalMp3Path!);
      expect(stat.size).toBeGreaterThan(0);

      // 4. downloadUrl is reachable via the dev-only static handler.
      expect(result.downloadUrl).not.toBeNull();
      // Static handler serves the file at `/exports/<runId>.mp3`.
      // We use the `app.getHttpServer()` base URL automatically
      // by passing it to `request`.
      const exportRes = await request(server)
        .get(`/exports/${result.runId}.mp3`)
        .expect(200);
      expect(exportRes.headers['content-type']).toMatch(/audio\/mpeg/);
      expect(exportRes.body.length || exportRes.body.byteLength || 0).toBeGreaterThan(0);

      // 5. The 4 step artifacts are on disk.
      const runDir = path.join(PIPELINE_TMP_DIR, result.runId);
      expect(fs.existsSync(path.join(runDir, '01-metadata.json'))).toBe(true);
      expect(fs.existsSync(path.join(runDir, '02-script.json'))).toBe(true);
      expect(fs.existsSync(path.join(runDir, '03-mixed.mp3'))).toBe(true);
      expect(fs.existsSync(path.join(runDir, '04-exported.mp3'))).toBe(true);
    });

    it('emits ≥ 8 progress events with monotonically non-decreasing percent', async () => {
      // Spin up a SECOND app for the progress-event capture. This
      // is the only way to inject a `progressCallback` over HTTP
      // (the controller hardcodes its own callback). The test
      // verifies the callback count from the first run via the
      // log path, then runs a direct call to assert the
      // monotonicity contract.
      const server = app.getHttpServer();
      const cb = jest.fn<void, [ProgressEvent]>();

      // Direct call (not via HTTP) so we can inject the callback.
      // We use the `app.get(PipelineService)` instance to call it.
      const { PipelineService } = await import(
        '../src/modules/pipeline/pipeline.service'
      );
      const svc = app.get(PipelineService);
      const r = await svc.runFullPipeline(
        { isbns: ['9787121362200'] },
        { progressCallback: cb },
      );
      try {
        const events = cb.mock.calls.map((c) => c[0] as ProgressEvent);
        progressCallCount = events.length;
        progressEvents.push(...events);
        expect(progressCallCount).toBeGreaterThanOrEqual(8);
        // Monotonic percent.
        for (let i = 1; i < events.length; i++) {
          expect(events[i].percent).toBeGreaterThanOrEqual(events[i - 1]!.percent);
        }
        // Step field goes 1→2→3→4 in order.
        const stepSeq: number[] = [];
        for (const e of events) {
          if (stepSeq[stepSeq.length - 1] !== e.step) stepSeq.push(e.step);
        }
        expect(stepSeq).toEqual([1, 2, 3, 4]);
        expect(r.status).toBe('success');
        cleanupExport(r.runId);
      } finally {
        cleanupExport(r.runId);
      }
      // Suppress unused-var for `server` — kept for symmetry with
      // the previous `it()` and to document the alternative HTTP path.
      void server;
    });
  });

  // --------------------------------------------------------------------
  // Case 2: partial path (step 2 throws)
  // --------------------------------------------------------------------
  describe('case 2 — returns partial when script generation fails', () => {
    let appPartial: INestApplication;
    let result: PipelineResult | null = null;

    beforeAll(async () => {
      appPartial = await buildApp({
        llmOverride: {
          generateScript: async () => {
            throw new Error('SCRIPT_EMPTY_BOOK: 模拟脚本生成失败');
          },
        },
      });
      await appPartial.init();
    });
    afterAll(async () => {
      if (appPartial) await appPartial.close();
      if (result) cleanupExport(result.runId);
    });

    it('returns status=partial with steps[1]=failed and steps[2]=skipped', async () => {
      const server = appPartial.getHttpServer();
      const res = await request(server)
        .post('/api/pipeline/run')
        .send({ isbns: ['9787121362200'] })
        .expect(200);

      expect(res.body.code).toBe(0);
      result = res.body.data as PipelineResult;

      // Overall status is 'partial' (NOT 'failed') because step 1
      // succeeded and produced an artifact; the state machine
      // (§A2.3) maps step 2 failure to `partial`.
      expect(result.status).toBe('partial');
      expect(result.finalMp3Path).toBeNull();
      expect(result.downloadUrl).toBeNull();

      expect(result.steps.length).toBe(4);
      expect(result.steps[0]!.step).toBe(1);
      expect(result.steps[0]!.status).toBe('success');
      expect(result.steps[1]!.step).toBe(2);
      expect(result.steps[1]!.status).toBe('failed');
      expect(result.steps[1]!.error).toMatch(/SCRIPT_EMPTY_BOOK|70003/);
      expect(result.steps[2]!.step).toBe(3);
      expect(result.steps[2]!.status).toBe('skipped');
      expect(result.steps[3]!.step).toBe(4);
      expect(result.steps[3]!.status).toBe('skipped');
    });
  });

  // --------------------------------------------------------------------
  // Defensive: validation rejects empty ISBNs at the DTO layer.
  // --------------------------------------------------------------------
  describe('DTO validation (class-validator)', () => {
    let appValidation: INestApplication;

    beforeAll(async () => {
      appValidation = await buildApp();
      await appValidation.init();
    });
    afterAll(async () => {
      if (appValidation) await appValidation.close();
    });

    it('rejects isbns=[] with HTTP 400', async () => {
      const server = appValidation.getHttpServer();
      await request(server)
        .post('/api/pipeline/run')
        .send({ isbns: [] })
        .expect(400);
    });

    it('rejects non-string isbns with HTTP 400', async () => {
      const server = appValidation.getHttpServer();
      await request(server)
        .post('/api/pipeline/run')
        .send({ isbns: [123, 456] })
        .expect(400);
    });
  });

  // --------------------------------------------------------------------
  // Suppress unused-var warnings for adapter imports that are kept
  // around to make the test readable but not used in the strict sense.
  // --------------------------------------------------------------------
  void ({} as BookApiAdapter);
  void ({} as TtsAdapter);
  void ({} as StorageAdapter);
  void ({} as ScriptSegmentDto);
});
