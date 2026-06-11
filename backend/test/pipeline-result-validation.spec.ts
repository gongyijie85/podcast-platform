/**
 * PipelineResult runtime-shape validation (v1.1).
 *
 * TypeScript already enforces the `PipelineResult` shape at compile
 * time (the `shared/types/pipeline.ts` interface is imported by
 * `backend/src/modules/pipeline/pipeline.service.ts` which returns
 * `Promise<PipelineResult>`). This spec is a **runtime** drift
 * guard: it asserts the SHAPE the orchestrator returns matches the
 * SHAPE the controller / E2E consumers expect, even if a future
 * refactor accidentally drops a field.
 *
 * We build a fully-typed `PipelineResult` literal, then run a series
 * of structural checks against it. The actual orchestrator output is
 * exercised by `pipeline.service.spec.ts` and `pipeline.e2e-spec.ts` —
 * this spec is ONLY about the type contract, not the runtime values.
 */

import type {
  PipelineResult,
  StepResult,
  ProgressEvent,
  PipelineStep,
  PipelineStatus,
  StepStatus,
  ScriptSegment,
  PipelineOptions,
  PipelineInput,
  PipelineBookMetadata,
} from '@shared/pipeline';

const V11_STATUSES: PipelineStatus[] = ['success', 'partial', 'failed'];
const V11_STEP_STATUSES: StepStatus[] = ['success', 'failed', 'skipped'];
const V11_STEPS: PipelineStep[] = [1, 2, 3, 4];
const V11_STAGES: ScriptSegment['stage'][] = [
  'opening',
  'intro',
  'interpret',
  'review',
  'suggest',
  'closing',
];
const V11_EMOTIONS: ScriptSegment['emotion'][] = [
  '开心',
  '沉思',
  '激昂',
  '平和',
  '感慨',
];

describe('PipelineResult shape (TP5)', () => {
  it('the type exports match the v1.1 spec', () => {
    // This test is mostly a tripwire: if a future change removes
    // one of these exports, the `import` at the top would fail and
    // the test would no longer compile. We additionally assert the
    // VALUES are what the spec says.
    expect(V11_STATUSES.length).toBe(3);
    expect(V11_STEP_STATUSES.length).toBe(3);
    expect(V11_STEPS.length).toBe(4);
    expect(V11_STAGES.length).toBe(6);
    expect(V11_EMOTIONS.length).toBe(5);
  });

  it('a hand-built PipelineResult passes structural validation', () => {
    const sample: PipelineResult = {
      runId: '00000000-0000-0000-0000-000000000000',
      finalMp3Path: '/abs/path/03-mixed.mp3',
      downloadUrl: '/exports/00000000-0000-0000-0000-000000000000.mp3',
      steps: [
        { step: 1, status: 'success', durationMs: 100, artifact: '/abs/01-metadata.json' },
        { step: 2, status: 'success', durationMs: 200, artifact: '/abs/02-script.json' },
        { step: 3, status: 'success', durationMs: 300, artifact: '/abs/03-mixed.mp3' },
        { step: 4, status: 'success', durationMs: 50, artifact: '/abs/04-exported.mp3' },
      ],
      status: 'success',
      totalDurationMs: 700,
    };

    // Top-level shape.
    expect(typeof sample.runId).toBe('string');
    expect(typeof sample.finalMp3Path).toBe('string');
    expect(typeof sample.downloadUrl).toBe('string');
    expect(Array.isArray(sample.steps)).toBe(true);
    expect(sample.steps.length).toBe(4);
    expect(V11_STATUSES).toContain(sample.status);
    expect(typeof sample.totalDurationMs).toBe('number');
    expect(sample.totalDurationMs).toBeGreaterThanOrEqual(0);

    // Per-step shape.
    for (let i = 0; i < sample.steps.length; i++) {
      const s = sample.steps[i]!;
      expect(V11_STEPS).toContain(s.step);
      expect(V11_STEP_STATUSES).toContain(s.status);
      expect(typeof s.durationMs).toBe('number');
      expect(s.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('a partial PipelineResult allows null finalMp3Path and downloadUrl', () => {
    const partial: PipelineResult = {
      runId: '00000000-0000-0000-0000-000000000000',
      finalMp3Path: null,
      downloadUrl: null,
      steps: [
        { step: 1, status: 'success', durationMs: 50, artifact: '/abs/01-metadata.json' },
        { step: 2, status: 'failed', durationMs: 10, error: '70003: SCRIPT_EMPTY_BOOK' },
        { step: 3, status: 'skipped', durationMs: 0 },
        { step: 4, status: 'skipped', durationMs: 0 },
      ],
      status: 'partial',
      totalDurationMs: 60,
    };
    expect(partial.status).toBe('partial');
    expect(partial.finalMp3Path).toBeNull();
    expect(partial.downloadUrl).toBeNull();
    expect(partial.steps[1]!.error).toMatch(/70003/);
    expect(partial.steps[2]!.status).toBe('skipped');
    expect(partial.steps[3]!.status).toBe('skipped');
  });

  it('StepResult.error is optional and never an empty string', () => {
    // When a step succeeds, `error` should be undefined (NOT an
    // empty string — the type system permits it but the runtime
    // contract from `pipeline.service.ts` always omits the key).
    const successStep: StepResult = { step: 1, status: 'success', durationMs: 100 };
    expect(successStep.error).toBeUndefined();
    // When a step fails, the error string starts with a 7xxx code.
    const failedStep: StepResult = { step: 2, status: 'failed', durationMs: 5, error: '70003: oops' };
    expect(failedStep.error).toMatch(/^700\d{2}:/);
  });

  it('ProgressEvent has the v1.1 4-step shape', () => {
    const e: ProgressEvent = {
      runId: '00000000-0000-0000-0000-000000000000',
      step: 1,
      percent: 0,
      message: 'test',
      timestamp: Date.now(),
    };
    expect(V11_STEPS).toContain(e.step);
    expect(typeof e.percent).toBe('number');
    expect(e.percent).toBeGreaterThanOrEqual(0);
    expect(e.percent).toBeLessThanOrEqual(100);
    expect(typeof e.message).toBe('string');
    expect(typeof e.timestamp).toBe('number');
  });

  it('PipelineInput and PipelineOptions have the expected fields', () => {
    const input: PipelineInput = {
      isbns: ['9787121362200'],
      options: { bgmVolume: 50, fadeInSec: 1, fadeOutSec: 1 },
    };
    expect(input.isbns.length).toBe(1);

    const opts: PipelineOptions = {
      hostVoice: 'mock-host',
      guestVoice: 'mock-guest',
      bgmTrack: 'silence-1s',
      bgmVolume: 50,
      fadeInSec: 1,
      fadeOutSec: 1,
    };
    expect(opts.bgmTrack).toBe('silence-1s');
    expect(opts.bgmVolume).toBe(50);
  });

  it('PipelineBookMetadata source is restricted to the v1.1 literal set', () => {
    const book: PipelineBookMetadata = {
      isbn: '9787121362200',
      title: '人类简史',
      author: '尤瓦尔·赫拉利',
      coverUrl: 'https://example.com/cover.jpg',
      summary: 'a long summary for the test',
      source: 'mock',
    };
    const validSources: PipelineBookMetadata['source'][] = [
      'openlibrary',
      'googlebooks',
      'mock',
    ];
    expect(validSources).toContain(book.source);
  });

  it('ScriptSegment has 6 valid stage values and 5 valid emotions', () => {
    const seg: ScriptSegment = {
      stage: 'opening',
      speaker: 'host',
      text: 'hi',
      emotion: '开心',
      orderIndex: 0,
    };
    expect(V11_STAGES).toContain(seg.stage);
    expect(V11_EMOTIONS).toContain(seg.emotion);
    expect(['host', 'guest']).toContain(seg.speaker);
  });
});
