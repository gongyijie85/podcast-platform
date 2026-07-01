import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 更新图书信息 DTO（当前仅支持口播稿字段）
 */
export class UpdateBookDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  livePitch?: string;
}
