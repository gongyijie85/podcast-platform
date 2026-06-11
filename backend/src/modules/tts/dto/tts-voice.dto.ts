import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TtsPreviewDto {
  @IsString()
  voiceId!: string;

  @IsString()
  @MaxLength(200)
  text!: string;

  @IsOptional()
  @IsString()
  emotion?: string;
}
