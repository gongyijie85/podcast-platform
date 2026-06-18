import type { TtsVoice } from '@shared/book';
import type { VoiceConfigDto } from '@shared/project';

export const PRESET_VOICES: TtsVoice[] = [
  { id: '冰糖', name: '冰糖', provider: 'xiaomi', gender: 'female', description: '清亮自然 / 主持导读', language: 'zh-CN' },
  { id: '茉莉', name: '茉莉', provider: 'xiaomi', gender: 'female', description: '柔和亲切 / 嘉宾回应', language: 'zh-CN' },
  { id: '苏打', name: '苏打', provider: 'xiaomi', gender: 'male', description: '年轻清爽 / 轻松对谈', language: 'zh-CN' },
  { id: '白桦', name: '白桦', provider: 'xiaomi', gender: 'male', description: '沉稳厚实 / 深度书评', language: 'zh-CN' },
  { id: 'BV001_streaming', name: '沉稳男声', provider: 'volcengine', gender: 'male', description: '新闻播报 / 沉稳叙述', language: 'zh-CN' },
  { id: 'BV002_streaming', name: '活力女声', provider: 'volcengine', gender: 'female', description: '轻松活泼 / 综艺', language: 'zh-CN' },
  { id: 'BV005_streaming', name: '知性男声', provider: 'volcengine', gender: 'male', description: '知识分享 / 学术', language: 'zh-CN' },
  { id: 'BV007_streaming', name: '温柔女声', provider: 'volcengine', gender: 'female', description: '情感 / 故事讲述', language: 'zh-CN' },
  { id: 'BV019_streaming', name: '磁性男声', provider: 'volcengine', gender: 'male', description: '深夜电台 / 旁白', language: 'zh-CN' },
  { id: 'BV033_streaming', name: '醇厚男声', provider: 'volcengine', gender: 'male', description: '纪录 / 文学', language: 'zh-CN' },
];

export const DEFAULT_HOST_VOICE_ID = '白桦';
export const DEFAULT_GUEST_VOICE_ID = '茉莉';

export function getVoiceProvider(voiceId: string): VoiceConfigDto['provider'] {
  return PRESET_VOICES.find((voice) => voice.id === voiceId)?.provider ?? 'xiaomi';
}

export const VOICE_PRESETS = [
  {
    id: 'professional-reading',
    name: '专业导读',
    description: '白桦搭配茉莉，沉稳主持与温和回应，适合知识型书籍导读。',
    hostVoiceId: '白桦',
    guestVoiceId: '茉莉',
  },
  {
    id: 'casual-dialogue',
    name: '轻松对谈',
    description: '苏打搭配冰糖，节奏更轻松、更有聊天感。',
    hostVoiceId: '苏打',
    guestVoiceId: '冰糖',
  },
  {
    id: 'deep-review',
    name: '深度书评',
    description: '白桦搭配苏打，适合观点分析和深度评论。',
    hostVoiceId: '白桦',
    guestVoiceId: '苏打',
  },
] as const;

export type VoicePresetId = (typeof VOICE_PRESETS)[number]['id'];
