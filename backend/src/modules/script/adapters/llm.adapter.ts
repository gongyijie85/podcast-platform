import type { BookMetadata } from '@shared/book';
import type { ScriptSegmentDto, ScriptEmotion, ScriptStage, Speaker } from '@shared/script';

export interface ScriptGenerationContext {
  projectId: string;
  books: BookMetadata[];
  mode: 'independent' | 'merged';
  template: 'standard' | 'merge';
  title: string;
}

export interface LlmAdapter {
  readonly name: string;
  generateScript(ctx: ScriptGenerationContext): Promise<ScriptSegmentDto[]>;
}
