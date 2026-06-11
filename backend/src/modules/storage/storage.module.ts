import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { MinioStorageAdapter } from './adapters/minio.adapter';
import { LocalStorageAdapter } from './adapters/local-storage.adapter';

@Global()
@Module({
  providers: [StorageService, MinioStorageAdapter, LocalStorageAdapter],
  exports: [StorageService],
})
export class StorageModule {}
