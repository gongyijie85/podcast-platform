import { ENV } from '../constants/env';

export const exportApi = {
  audioUrl(projectId: string): string {
    return `${ENV.apiBaseUrl}/api/projects/${projectId}/audio`;
  },
  subtitleUrl(projectId: string, format: 'srt' | 'vtt'): string {
    return `${ENV.apiBaseUrl}/api/projects/${projectId}/subtitle?format=${format}`;
  },
  exportUrl(projectId: string, format: 'mp3' | 'srt' | 'vtt' | 'txt' | 'pdf' | 'zip'): string {
    return `${ENV.apiBaseUrl}/api/projects/${projectId}/export?format=${format}`;
  },
};
