/**
 * Progress event helper for the v1.1 flow layer.
 *
 * Why a dedicated helper (vs. just calling `callback(event)` inline):
 *  - Centralises the try/catch around user-supplied callbacks so a buggy
 *    progress consumer CANNOT crash the in-flight `runFullPipeline` call.
 *  - Enforces the architecture §A7.5 "monotonically non-decreasing percent"
 *    invariant. Each run gets a `ProgressTracker` (per call) that clamps
 *    the emitted percent to the highest value seen so far. This is opt-in
 *    for callers that need the strict guarantee; raw emitters can ignore.
 *  - Standardises the timestamp source (`Date.now()`) so callers don't
 *    have to remember to stamp events.
 *
 * NOTE: We deliberately do NOT import the v1.0 `ProgressGateway` or
 * `EventEmitter` here. v1.1 uses a function-reference callback (see
 * architecture §A6 决策 1) — keeping this module dependency-free makes it
 * trivial to unit test.
 */

import type { ProgressCallback, ProgressEvent, PipelineStep } from '@shared/pipeline';

/**
 * Push a single progress event to the optional callback.
 *
 * The callback is invoked inside try/catch; any thrown error is logged via
 * `console.warn` (not Nest's Logger — this module must remain importable
 * from any context, including pure unit tests where Nest's DI is absent).
 *
 * Returns `true` when the event was delivered, `false` when the caller did
 * not supply a callback. This is mostly for tests so they can assert the
 * tracker state without inspecting `mockCallback.mock.calls`.
 */
export function emitProgress(
  callback: ProgressCallback | undefined,
  runId: string,
  step: PipelineStep,
  percent: number,
  message: string,
): boolean {
  if (!callback) return false;
  const event: ProgressEvent = {
    runId,
    step,
    percent: clampPercent(percent),
    message,
    timestamp: Date.now(),
  };
  try {
    callback(event);
    return true;
  } catch (e: unknown) {
    // We intentionally swallow user-callback errors. The pipeline must not
    // fail because a downstream consumer threw; that would be a regression
    // vs. v1.0 where `ProgressGateway` was a fire-and-forget sink.
    console.warn(
      `[pipeline/progress] callback threw for runId=${runId} step=${step}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return false;
  }
}

/**
 * Per-run monotonically-non-decreasing percent wrapper.
 *
 * Returns a `WrappedProgressCallback` that clamps the `percent` field of
 * every emitted event so it is NEVER lower than the highest value seen
 * earlier in the same run (architecture §A7.5). The wrapping is
 * per-run, so callers can run concurrent `runFullPipeline` calls
 * without interfering with each other's trackers.
 *
 * Callers that don't need the strict guarantee can pass the raw
 * callback to `emitProgress` directly.
 */
export function makeMonotonicProgressCallback(
  raw: ProgressCallback | undefined,
): ProgressCallback | undefined {
  if (!raw) return undefined;
  let lastPercent = -1;
  return (event: ProgressEvent) => {
    const clamped = Math.max(event.percent, lastPercent);
    lastPercent = clamped;
    raw({ ...event, percent: clamped });
  };
}

/**
 * Clamp percent to the [0, 100] integer range. Non-integer values are
 * rounded DOWN so the monotonic guarantee is conservative (we never claim
 * more progress than we have). NaN / Infinity are normalised to 0.
 */
function clampPercent(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return 0;
  if (p >= 100) return 100;
  return Math.floor(p);
}
