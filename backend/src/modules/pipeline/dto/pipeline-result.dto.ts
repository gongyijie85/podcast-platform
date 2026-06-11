/**
 * PipelineResultDto — class-validator wrapper around the runtime
 * `PipelineResult` shape from `shared/types/pipeline.ts`.
 *
 * We keep the DTO structurally identical to the shared interface so the
 * orchestrator can return either form (the controller returns the
 * shared type for the response body; this DTO is used purely for
 * validation when callers POST a `PipelineResult`-shaped payload for
 * verification, e.g. in the E2E suite).
 *
 * Why both a shared interface AND a DTO:
 *  - The shared interface keeps the front-end and back-end aligned
 *    without forcing a Nest dependency on the FE.
 *  - The DTO lets us apply class-validator decorators at the HTTP
 *    boundary, which the shared interface cannot do (interfaces erase
 *    at runtime).
 */

import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  PipelineResult as SharedPipelineResult,
  PipelineStatus,
  PipelineStep,
  StepStatus,
} from '@shared/pipeline';

export class StepResultDto {
  @IsIn([1, 2, 3, 4])
  step!: PipelineStep;

  @IsIn(['success', 'failed', 'skipped'])
  status!: StepStatus;

  @IsInt()
  @Min(0)
  durationMs!: number;

  @IsOptional()
  @IsString()
  artifact?: string;

  @IsOptional()
  @IsString()
  error?: string;
}

export class PipelineResultDto implements SharedPipelineResult {
  @IsString()
  runId!: string;

  /** Absolute path to the final mixed MP3, or `null` when the pipeline failed. */
  @IsOptional()
  @IsString()
  finalMp3Path!: string | null;

  /** Public HTTP download URL, or `null` when step 4 was skipped/failed. */
  @IsOptional()
  @IsString()
  downloadUrl!: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepResultDto)
  steps!: StepResultDto[];

  @IsIn(['success', 'partial', 'failed'])
  status!: PipelineStatus;

  @IsNumber()
  @Min(0)
  totalDurationMs!: number;

  /** Marker so this class is recognised by Nest as a DTO at runtime. */
  readonly __isDto = true;
  // Intentionally typed as `unknown` to avoid `IsObject` choking on
  // the marker property at construction time.
  @IsObject()
  @IsOptional()
  _marker?: unknown;
}
