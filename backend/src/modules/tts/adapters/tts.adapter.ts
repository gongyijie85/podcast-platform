import type { TtsVoice, TtsPreviewResult } from '@shared/book';

export interface TtsAdapter {
  readonly name: string;
  listVoices(): Promise<TtsVoice[]>;
  synthesize(text: string, voiceId: string, options?: { emotion?: string }): Promise<{ buffer: Buffer; durationMs: number }>;
  preview(text: string, voiceId: string): Promise<TtsPreviewResult>;
}
