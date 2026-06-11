import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { StorageAdapter } from './storage.adapter';

/**
 * LocalStorageAdapter: drop-in fallback for environments without MinIO/OSS.
 * Files are written under ./storage/<key>.
 */
@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'local';
  private readonly logger = new Logger(LocalStorageAdapter.name);
  private root: string;
  private publicBase: string;

  constructor(private readonly config: ConfigService) {
    this.root = path.resolve(process.cwd(), 'storage');
    this.publicBase = '/storage';
    void this.config;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = path.join(this.root, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }

  async get(key: string): Promise<Buffer> {
    const full = path.join(this.root, key);
    return fs.readFile(full);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.root, key));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string): Promise<string> {
    return this.publicUrl(key);
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.root, key));
    } catch (e) {
      this.logger.warn(`unlink ${key}: ${(e as Error).message}`);
    }
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }
}
