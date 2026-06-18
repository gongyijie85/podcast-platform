import type { BookMetadata } from '@shared/book';
import type { RevisionPreset, ScriptTemplate } from '@shared/project';
import type { EpisodeBriefDto, ScriptSegmentDto } from '@shared/script';

export interface ScriptGenerationContext {
  projectId: string;
  books: BookMetadata[];
  mode: 'independent' | 'merged';
  template: 'standard' | 'merge';
  scriptTemplate: ScriptTemplate;
  revisionPreset?: RevisionPreset;
  customInstruction?: string | null;
  title: string;
}

export interface GeneratedScriptResult {
  segments: ScriptSegmentDto[];
  episodeBrief?: EpisodeBriefDto | null;
}

export interface LlmAdapter {
  readonly name: string;
  generateScript(ctx: ScriptGenerationContext): Promise<GeneratedScriptResult>;
}
