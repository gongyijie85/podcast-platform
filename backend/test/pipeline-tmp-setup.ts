/**
 * Per-test setup helper for the v1.1 pipeline E2E suite.
 *
 * `beforeEach` removes the per-run scratch dir under `backend/tmp/pipeline/`
 * so each E2E case starts from a clean state. The `backend/tmp/exports/`
 * directory is intentionally NOT wiped — that directory is the
 * 24h-retention acceptance artefact and the E2E suite must verify
 * against real exports (PRD §INCR-04).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const PIPELINE_TMP_DIR = path.resolve(__dirname, '..', 'tmp', 'pipeline');
// `process.cwd()` is `.../podcast-platform/backend` when running
// `cd backend && pnpm test`, so the path is `tmp/exports`.
const EXPORTS_TMP_DIR = path.resolve(process.cwd(), 'tmp', 'exports');

/**
 * Wipe `backend/tmp/pipeline/<runId>/` for a specific runId. Tests
 * that captured the runId (e.g. from a previous `runFullPipeline` call)
 * can call this directly.
 */
export function cleanupRunDir(runId: string): void {
  const dir = path.join(PIPELINE_TMP_DIR, runId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Drop only the `<runId>.mp3` from the exports dir. Leaves every
 * OTHER export alone (24h retention).
 */
export function cleanupExport(runId: string): void {
  const exportFile = path.join(EXPORTS_TMP_DIR, `${runId}.mp3`);
  if (fs.existsSync(exportFile)) {
    try { fs.unlinkSync(exportFile); } catch { /* ignore */ }
  }
}

/**
 * `beforeEach` hook factory. Returns a function suitable for
 * `beforeEach(setupBeforeEach())`. The hook ensures both dirs exist
 * (so the orchestrator can write into them) and removes any
 * leftover `<runId>.mp3` files whose name starts with `e2e-` (a
 * convention we use to mark files we own).
 */
export function setupBeforeEach(): () => void {
  return () => {
    fs.mkdirSync(PIPELINE_TMP_DIR, { recursive: true });
    fs.mkdirSync(EXPORTS_TMP_DIR, { recursive: true });
    // Clean up only our own marked exports.
    if (fs.existsSync(EXPORTS_TMP_DIR)) {
      for (const f of fs.readdirSync(EXPORTS_TMP_DIR)) {
        if (f.startsWith('e2e-') && f.endsWith('.mp3')) {
          try { fs.unlinkSync(path.join(EXPORTS_TMP_DIR, f)); } catch { /* ignore */ }
        }
      }
    }
  };
}
