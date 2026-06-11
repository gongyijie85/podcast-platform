import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MinioStorageAdapter } from './adapters/minio.adapter';
import { LocalStorageAdapter } from './adapters/local-storage.adapter';
import type { StorageAdapter } from './adapters/storage.adapter';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private driver: StorageAdapter;

  constructor(
    config: ConfigService,
    minio: MinioStorageAdapter,
    local: LocalStorageAdapter,
  ) {
    const driver = config.get<string>('storage.driver') || 'minio';
    if (driver === 'minio') this.driver = minio;
    else this.driver = local;
    this.logger.log(`Storage driver: ${this.driver.name}`);
  }

  put(key: string, body: Buffer, contentType?: string): Promise<void> {
    return this.driver.put(key, body, contentType);
  }
  get(key: string): Promise<Buffer> {
    return this.driver.get(key);
  }
  exists(key: string): Promise<boolean> {
    return this.driver.exists(key);
  }
  getSignedUrl(key: string, expiresInSec = 3600): Promise<string> {
    return this.driver.getSignedUrl(key, expiresInSec);
  }
  remove(key: string): Promise<void> {
    return this.driver.remove(key);
  }
  publicUrl(key: string): string {
    return this.driver.publicUrl(key);
  }
}
