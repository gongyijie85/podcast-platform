import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { StorageAdapter } from '../../storage/adapters/storage.adapter';

/**
 * LocalDiskStorageAdapter — v1.1 increment.
 *
 * A standalone drop-in `StorageAdapter` implementation that:
 *  - Writes files under `backend/tmp/exports/` (NOT `backend/storage/`).
 *  - Exposes them via `publicBase = '/exports'`, so the v1.1
 *    `ExportTmpController` static route can serve them.
 *  - Returns `publicUrl(key)` as the path-only form `/exports/<key>` (no
 *    host prefix) so the v1.1 caller (PipelineService) can append a host
 *    when it needs an absolute URL.
 *
 * This class COEXISTS with `LocalStorageAdapter` (v1.0) — they have
 * different class names, different roots, and different publicBase values.
 * `StorageService` continues to bind to the v1.0 adapter as before; the
 * flow layer binds this new adapter to the `STORAGE_ADAPTER` token.
 *
 * The 24h retention (PRD §INCR-04) is NOT enforced automatically. Files
 * persist on disk until deleted by the operator or the next E2E run wipes
 * `backend/tmp/exports/` via the `backend/tmp/.gitignore` flow.
 */
@Injectable()
export class LocalDiskStorageAdapter implements StorageAdapter {
  readonly name = 'local-disk';
  private readonly logger = new Logger(LocalDiskStorageAdapter.name);
  private readonly root: string;
  private readonly publicBase = '/exports';

  constructor() {
    // The backend is bootstrapped from the `backend/` working
    // directory, so `process.cwd()` is already `.../podcast-platform/backend`.
    // Resolving `tmp/exports` (not `backend/tmp/exports`) keeps the path
    // consistent with the root `.gitignore` (`backend/tmp/`) and prevents
    // a double-nested `backend/backend/tmp/exports/` tree.
    this.root = path.resolve(process.cwd(), 'tmp', 'exports');
  }

  async put(key: string, body: Buffer, _contentType?: string): Promise<void> {
    const full = this.resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
    this.logger.log(`put ${key} (${body.length} bytes) → ${full}`);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(_key: string, _expiresInSec = 3600): Promise<string> {
    // v1.1 has no signing — return the public URL directly.
    return this.publicUrl(_key);
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolveKey(key));
    } catch (e) {
      this.logger.warn(`unlink ${key}: ${(e as Error).message}`);
    }
  }

  publicUrl(key: string): string {
    // Returns ONLY the path portion (no host). Callers can prepend a host.
    return `${this.publicBase}/${key}`;
  }

  /** Exposed for tests and the E2E controller to find the on-disk path. */
  resolveKey(key: string): string {
    return path.join(this.root, key);
  }
}
