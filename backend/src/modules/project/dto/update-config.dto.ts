import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BgmConfigInput, VoiceConfigInput } from './create-project.dto';

export class UpdateConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VoiceConfigInput)
  voices?: VoiceConfigInput[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BgmConfigInput)
  bgmConfigs?: BgmConfigInput[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  voiceVolume?: number;

  @IsOptional()
  @IsBoolean()
  subtitleEnabled?: boolean;
}
