/**
 * RunPipelineDto — class-validator wrapper around `PipelineInput`.
 *
 * Two-stage validation strategy:
 *  1. `class-validator` enforces structural rules here (non-empty
 *     array, max length, ISBN format) so a malformed request gets
 *     rejected at the HTTP boundary before reaching the orchestrator.
 *  2. The orchestrator (`PipelineService.runFullPipeline`) does its
 *     own business validation (e.g. 70001 for empty ISBNs in case the
 *     DTO is bypassed in a non-HTTP context, like an internal cron
 *     job that calls the service directly).
 *
 * `class-transformer` is used to coerce the optional `options` block
 * into a `PipelineOptionsDto` so nested validation kicks in.
 */

import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PipelineOptionsDto {
  @IsOptional()
  @IsString()
  hostVoice?: string;

  @IsOptional()
  @IsString()
  guestVoice?: string;

  @IsOptional()
  @IsIn(['silence-1s'])
  bgmTrack?: 'silence-1s';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  bgmVolume?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  fadeInSec?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  fadeOutSec?: number;
}

export class RunPipelineDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'isbns must be a non-empty array' })
  @ArrayMaxSize(20, { message: 'isbns must contain at most 20 entries' })
  @IsString({ each: true })
  @Length(10, 13, { each: true, message: 'each ISBN must be 10..13 characters' })
  isbns!: string[];

  @IsOptional()
  @Type(() => PipelineOptionsDto)
  options?: PipelineOptionsDto;
}
