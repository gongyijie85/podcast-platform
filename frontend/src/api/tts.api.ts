import { request } from './client';
import type { TtsVoice, TtsPreviewResult } from '@shared/book';

export const ttsApi = {
  async listVoices(): Promise<TtsVoice[]> {
    return request<TtsVoice[]>({ method: 'GET', url: '/api/tts/voices' });
  },
  async preview(voiceId: string, text: string, emotion?: string): Promise<TtsPreviewResult> {
    return request<TtsPreviewResult>({ method: 'POST', url: '/api/tts/preview', data: { voiceId, text, emotion } });
  },
};
