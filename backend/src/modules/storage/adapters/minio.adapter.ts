import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import type { StorageAdapter } from './storage.adapter';

@Injectable()
export class MinioStorageAdapter implements StorageAdapter {
  readonly name = 'minio';
  private readonly logger = new Logger(MinioStorageAdapter.name);
  private client: MinioClient;
  private bucket: string;
  private publicBase: string;

  constructor(private readonly config: ConfigService) {
    const minio = this.config.get<{
      endpoint: string;
      port: number;
      accessKey: string;
      secretKey: string;
      bucket: string;
      useSSL: boolean;
    }>('storage.minio')!;
    this.bucket = minio.bucket;
    this.client = new MinioClient({
      endPoint: minio.endpoint,
      port: minio.port,
      useSSL: minio.useSSL,
      accessKey: minio.accessKey,
      secretKey: minio.secretKey,
    });
    this.publicBase = `http://${minio.endpoint}:${minio.port}/${minio.bucket}`;
  }

  async put(key: string, body: Buffer, contentType?: string): Promise<void> {
    await this.ensureBucket();
    const meta: Record<string, string> = {};
    if (contentType) meta['Content-Type'] = contentType;
    await this.client.putObject(this.bucket, key, body, body.length, meta);
  }

  async get(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', (e: Error) => reject(e));
    });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string, expiresInSec: number): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, expiresInSec);
  }

  async remove(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  private async ensureBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket, 'us-east-1');
        this.logger.log(`MinIO bucket '${this.bucket}' created`);
      }
    } catch (e) {
      this.logger.warn(`MinIO bucket ensure failed (continuing): ${(e as Error).message}`);
    }
  }
}
