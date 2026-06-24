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
    const local = this.config.get<{ root?: string }>('storage.local');
    this.root = path.resolve(process.cwd(), local?.root || 'storage');
    this.publicBase = '/storage';
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolveSafeKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }

  async get(key: string): Promise<Buffer> {
    const full = this.resolveSafeKey(key);
    return fs.readFile(full);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveSafeKey(key));
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
      await fs.unlink(this.resolveSafeKey(key));
    } catch (e) {
      this.logger.warn(`unlink ${key}: ${(e as Error).message}`);
    }
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  /**
   * 将 key 解析为 root 内的绝对路径，拒绝路径遍历（如 ../）。
   * 防止攻击者通过 key 读写 root 之外的任意文件。
   */
  private resolveSafeKey(key: string): string {
    const resolved = path.resolve(this.root, key);
    // 解析后必须在 root 目录内（或等于 root 本身）
    if (!resolved.startsWith(this.root + path.sep) && resolved !== this.root) {
      throw new Error(`Invalid storage key: path traversal detected (${key})`);
    }
    return resolved;
  }
}
