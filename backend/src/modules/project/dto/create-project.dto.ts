import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class VoiceConfigInput {
  @IsIn(['host', 'guest'])
  role!: 'host' | 'guest';

  @IsString()
  voiceId!: string;

  @IsIn(['volcengine', 'azure', 'mock'])
  provider!: 'volcengine' | 'azure' | 'mock';
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
