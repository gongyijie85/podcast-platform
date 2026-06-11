import type { TtsVoice } from '@shared/book';

export const PRESET_VOICES: TtsVoice[] = [
  { id: 'BV001_streaming', name: '沉稳男声', provider: 'volcengine', gender: 'male', description: '新闻播报 / 沉稳叙述', language: 'zh-CN' },
  { id: 'BV002_streaming', name: '活力女声', provider: 'volcengine', gender: 'female', description: '轻松活泼 / 综艺', language: 'zh-CN' },
  { id: 'BV005_streaming', name: '知性男声', provider: 'volcengine', gender: 'male', description: '知识分享 / 学术', language: 'zh-CN' },
  { id: 'BV007_streaming', name: '温柔女声', provider: 'volcengine', gender: 'female', description: '情感 / 故事讲述', language: 'zh-CN' },
  { id: 'BV019_streaming', name: '磁性男声', provider: 'volcengine', gender: 'male', description: '深夜电台 / 旁白', language: 'zh-CN' },
  { id: 'BV033_streaming', name: '醇厚男声', provider: 'volcengine', gender: 'male', description: '纪录 / 文学', language: 'zh-CN' },
];

export const DEFAULT_HOST_VOICE_ID = 'BV001_streaming';
export const DEFAULT_GUEST_VOICE_ID = 'BV007_streaming';
