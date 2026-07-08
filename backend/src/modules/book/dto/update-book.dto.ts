import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type { BookEnrichment } from '@shared/book';

/**
 * 更新图书信息 DTO（当前仅支持口播稿字段）
 */
export class UpdateBookDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  livePitch?: string;
}

export class UpdateBookEnrichmentDto {
  @IsOptional()
  @IsObject()
  enrichment?: BookEnrichment;
}
