import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BookMetadataInput {
  @IsString()
  isbn!: string;

  @IsString()
  @MaxLength(240)
  title!: string;

  @IsString()
  @MaxLength(240)
  author!: string;

  @IsOptional()
  @IsString()
  coverUrl?: string | null;

  @IsOptional()
  @IsString()
  summary?: string | null;

  @IsOptional()
  @IsString()
  podcastAngle?: string | null;

  @IsOptional()
  @IsString()
  publisher?: string | null;

  @IsOptional()
  @IsString()
  publishedDate?: string | null;

  @IsOptional()
  @IsIn(['openlibrary', 'googlebooks', 'mock', 'bookrank'])
  source?: 'openlibrary' | 'googlebooks' | 'mock' | 'bookrank';
}

export class VoiceConfigInput {
  @IsIn(['host', 'guest'])
  role!: 'host' | 'guest';

  @IsString()
  voiceId!: string;

  @IsIn(['xiaomi', 'volcengine', 'azure', 'mock'])
  provider!: 'xiaomi' | 'volcengine' | 'azure' | 'mock';
}

export class BgmConfigInput {
  @IsIn(['intro', 'body', 'outro'])
  segment!: 'intro' | 'body' | 'outro';

  @IsString()
  bgmTrackId!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  volume!: number;

  @IsInt()
  @Min(0)
  @Max(5000)
  fadeInMs!: number;

  @IsInt()
  @Min(0)
  @Max(5000)
  fadeOutMs!: number;
}

export class CreateProjectDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsIn(['independent', 'merged'])
  mode!: 'independent' | 'merged';

  @IsArray()
  @IsString({ each: true })
  isbns!: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookMetadataInput)
  books?: BookMetadataInput[];

  @IsOptional()
  @IsIn(['default', 'deep-review', 'casual-talk', 'academic', 'audio-overview'])
  scriptTemplate?: 'default' | 'deep-review' | 'casual-talk' | 'academic' | 'audio-overview';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VoiceConfigInput)
  voices!: VoiceConfigInput[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BgmConfigInput)
  bgmConfigs!: BgmConfigInput[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  voiceVolume?: number;

  @IsOptional()
  @IsBoolean()
  subtitleEnabled?: boolean;
}
