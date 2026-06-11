export type Speaker = 'host' | 'guest';
export type ScriptStage = 'intro' | 'introduce' | 'interpret' | 'review' | 'suggest' | 'closing';
export type ScriptEmotion = '开心' | '沉思' | '激昂' | '平缓' | '紧张' | '温柔' | '坚定' | '幽默';

export interface ScriptSegmentDto {
  id: string;
  scriptId: string;
  orderIndex: number;
  speaker: Speaker;
  text: string;
  emotion: ScriptEmotion;
  stage: ScriptStage;
  startTime?: number | null;
  endTime?: number | null;
}

export interface ScriptDto {
  id: string;
  projectId: string;
  version: number;
  content: string; // TipTap JSON serialized
  rawText: string;
  wordCount: number;
  segments?: ScriptSegmentDto[];
}

export interface GenerateScriptResponse {
  script: ScriptDto;
  segments: ScriptSegmentDto[];
}

export interface SaveScriptPayload {
  content: string;
  rawText: string;
  segments: Array<Omit<ScriptSegmentDto, 'id' | 'scriptId' | 'startTime' | 'endTime'>>;
}
