import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { RevisionPreset, ScriptTemplate } from '@shared/project';

export class GenerateProjectDto {
  @IsOptional()
  @IsIn(['default', 'deep-review', 'casual-talk', 'academic', 'audio-overview'])
  scriptTemplate?: ScriptTemplate;
}

export class RegenerateProjectDto extends GenerateProjectDto {
  @IsOptional()
  @IsIn(['deeper', 'less-filler', 'lighter', 'shorter', 'more-cross-book'])
  revisionPreset?: RevisionPreset;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customInstruction?: string;
}
