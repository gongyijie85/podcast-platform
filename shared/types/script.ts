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

export interface EpisodeBriefDto {
  episodeQuestion: string;
  openingPromise: string;
  bookRoles: Array<{
    title: string;
    role: string;
  }>;
  crossBookAngles: string[];
  listenerTakeaways: string[];
  sourceLimits: string[];
}

export interface ScriptQualityReportDto {
  status: 'pass' | 'warning';
  warnings: string[];
  bookCoverage: Array<{
    title: string;
    mentionCount: number;
    mentioned: boolean;
    hasSubstantiveLine: boolean;
    summaryAvailable: boolean;
  }>;
  hasCrossBookComparison: boolean;
  fillerPhraseCount: number;
  titleIntegrityWarnings: string[];
  groundednessWarnings: string[];
}

export interface ScriptDto {
  id: string;
  projectId: string;
  version: number;
  content: string; // TipTap JSON serialized
  rawText: string;
  wordCount: number;
  segments?: ScriptSegmentDto[];
  episodeBrief?: EpisodeBriefDto | null;
  qualityReport?: ScriptQualityReportDto | null;
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
