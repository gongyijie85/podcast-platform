export interface StorageAdapter {
  readonly name: string;
  put(key: string, body: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  getSignedUrl(key: string, expiresInSec: number): Promise<string>;
  remove(key: string): Promise<void>;
  /** Returns a public URL (for local MinIO) or a CDN URL. */
  publicUrl(key: string): string;
}
