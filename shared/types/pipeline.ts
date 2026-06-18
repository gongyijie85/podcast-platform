/**
 * Cross-module pipeline type definitions (v1.1 increment).
 *
 * These types are intentionally kept in the workspace-level `shared/types/`
 * tree so the front-end and back-end can both reference them without
 * introducing a circular dependency on the backend module graph.
 *
 * Conventions inherited from the v1.0 shared layer:
 *  - `*Dto` / `*Payload` types are the network-facing DTO shapes.
 *  - `ProgressEvent` here is a SIMPLIFIED v1.1 shape (it coexists with
 *    the v1.0 WebSocket `ProgressEvent` in `shared/types/job.ts`, but the
 *    flow-layer one is process-local and 4-step-flavoured).
 *  - `step` is restricted to the 4 pipeline steps, `1..4` literal union.
 *  - All optional fields are explicitly marked with `?` (no `any`).
 */

/** A single ISBN-13 (10/13 char) string. Validated at the DTO layer. */
export type IsbnString = string;

/** Step literal for the 4-step end-to-end flow. */
export type PipelineStep = 1 | 2 | 3 | 4;

/** Status of the overall pipeline (see architecture §A2.3). */
export type PipelineStatus = 'success' | 'partial' | 'failed';

/** Per-step status (see architecture §A2.3). */
export type StepStatus = 'success' | 'failed' | 'skipped';

/** Caller-supplied options for the 4-step pipeline. */
export interface PipelineOptions {
  /** Reserved for future host-voice TTS. Mocks ignore this. */
  hostVoice?: string;
  /** Reserved for future guest-voice TTS. Mocks ignore this. */
  guestVoice?: string;
  /**
   * BGM track selection. The v1.1 increment only ships one fixture BGM
   * (`silence-1s`) so the union is a single literal. When v1.2 adds more
   * tracks, extend the union and update `LocalDiskStorageAdapter` whitelist.
   */
  bgmTrack?: 'silence-1s';
  /** BGM volume in the 0..100 range. Default `50`. */
  bgmVolume?: number;
  /** BGM fade-in seconds in the 0..10 range. Default `1`. */
  fadeInSec?: number;
  /** BGM fade-out seconds in the 0..10 range. Default `1`. */
  fadeOutSec?: number;
}

/** Entry-point payload for `runFullPipeline`. */
export interface PipelineInput {
  /** 1..20 ISBNs. The pipeline picks the first successfully-resolved book. */
  isbns: IsbnString[];
  /** Optional caller-supplied knobs. */
  options?: PipelineOptions;
}

/** Single step outcome. */
export interface StepResult {
  step: PipelineStep;
  status: StepStatus;
  /** Wall-clock duration of this step in ms (used for logs / SLA). */
  durationMs: number;
  /** Path to the artifact file on disk (when the step produced one). */
  artifact?: string;
  /** Error code (70001..70005) + human message when the step failed. */
  error?: string;
}

/** Full result of a single `runFullPipeline` call. */
export interface PipelineResult {
  runId: string;
  /** Absolute path to the final mixed MP3, or `null` when the pipeline failed. */
  finalMp3Path: string | null;
  /** Public HTTP download URL, or `null` when step 4 was skipped/failed. */
  downloadUrl: string | null;
  /** Always exactly 4 entries (one per step), in step order. */
  steps: StepResult[];
  status: PipelineStatus;
  /** End-to-end wall-clock duration in ms. */
  totalDurationMs: number;
}

/** Progress event shape pushed to the optional `ProgressCallback`. */
export interface ProgressEvent {
  runId: string;
  step: PipelineStep;
  /** 0..100. Within a single run, percent MUST be monotonically non-decreasing. */
  percent: number;
  /** Short human-readable status, e.g. `解析 ISBN 1/1`. */
  message: string;
  /** `Date.now()` at the time the event was emitted. */
  timestamp: number;
}

/** Caller-supplied function reference. Optional; tests use `jest.fn()`. */
export type ProgressCallback = (event: ProgressEvent) => void;

/** A single script line. Six stages × (host + guest) = 12 per run. */
export interface ScriptSegment {
  stage: 'opening' | 'intro' | 'interpret' | 'review' | 'suggest' | 'closing';
  speaker: 'host' | 'guest';
  text: string;
  /** v1.1 restricts to 5 values (see architecture §A1.5). */
  emotion: '开心' | '沉思' | '激昂' | '平和' | '感慨';
  orderIndex: number;
}

/**
 * Book metadata shape returned by step 1. Mirrors `shared/types/book.ts`
 * `BookMetadata` but with `source` narrowed to a literal that is safe for
 * the mock flow. We keep the field name compatible with v1.0 so cross-
 * module consumers do not need an adapter.
 */
export interface PipelineBookMetadata {
  isbn: IsbnString;
  title: string;
  author: string;
  coverUrl: string;
  summary: string;
  source: 'openlibrary' | 'googlebooks' | 'mock' | 'bookrank';
}
