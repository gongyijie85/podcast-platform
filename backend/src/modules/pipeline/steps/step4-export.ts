/**
 * Step 4 — copy the mixed MP3 from `backend/tmp/pipeline/<runId>/03-mixed.mp3`
 * to the `LocalDiskStorageAdapter` root (`backend/tmp/exports/`) and
 * also persist a `04-exported.mp3` copy inside the run directory for
 * symmetry with the other 3 step artifacts.
 *
 * Storage adapter contract: `put(key, body, contentType?)` writes the
 * buffer under `<root>/<key>` and `publicUrl(key)` returns `/exports/<key>`
 * (path-only, no host — the controller layer prepends the host).
 *
 * Failure semantics: any error from `put()` (permission denied, disk
 * full, etc.) propagates to the orchestrator. Step 4 has no partial
 * mode — the file either lands on disk or the step `failed`s.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { StorageAdapter } from '../../storage/adapters/storage.adapter';
import { STORAGE_ADAPTER } from '../pipeline.tokens';
import { emitProgress } from '../progress';
import type { ProgressCallback, PipelineStep } from '@shared/pipeline';

export interface Step4Output {
  /** Path-only download URL (`/exports/<runId>.mp3`). */
  downloadUrl: string;
  /** Storage key passed to `StorageAdapter.put`. */
  storageKey: string;
  /** Absolute path to the on-disk copy inside the run dir. */
  artifactPath: string;
  /** File size in bytes (number, NOT bigint — see architecture §A8.3 #5). */
  sizeBytes: number;
  durationMs: number;
}

export interface Step4Input {
  runId: string;
  runDir: string;
  mixedAudioPath: string;
  progressCallback?: ProgressCallback;
}

export async function runStep4(
  storage: StorageAdapter,
  input: Step4Input,
): Promise<Step4Output> {
  const step: PipelineStep = 4;
  const start = Date.now();
  emitProgress(input.progressCallback, input.runId, step, 0, '导出 MP3 到本地磁盘');

  // Read the mixed audio from disk (step 3's output).
  const body = await fs.readFile(input.mixedAudioPath);

  // Persist a `04-exported.mp3` copy inside the run directory for
  // symmetry. This is a *copy* of `03-mixed.mp3` so reviewers can
  // eyeball the final artifact without leaving the run dir.
  const artifactPath = path.join(input.runDir, '04-exported.mp3');
  await fs.mkdir(input.runDir, { recursive: true });
  await fs.writeFile(artifactPath, body);

  // Hand off to the storage adapter. The key uses the runId so two
  // concurrent runs can never clobber each other's exports.
  const storageKey = `${input.runId}.mp3`;
  await storage.put(storageKey, body, 'audio/mpeg');

  const downloadUrl = storage.publicUrl(storageKey);

  emitProgress(input.progressCallback, input.runId, step, 100, '步 4 完成');

  return {
    downloadUrl,
    storageKey,
    artifactPath,
    sizeBytes: body.length,
    durationMs: Date.now() - start,
  };
}

@Injectable()
export class Step4Export {
  constructor(@Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter) {}

  async run(input: Step4Input): Promise<Step4Output> {
    return runStep4(this.storage, input);
  }
}
