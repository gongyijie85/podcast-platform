export type ProjectMode = 'independent' | 'merged';
export type ProjectStatus =
  | 'draft'
  | 'generating'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'partial';

export type GenerationStage = 'metadata' | 'script' | 'tts' | 'subtitle' | 'mix';

export interface ProjectBookDto {
  id: string;
  projectId: string;
  isbn: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  summary?: string | null;
  orderIndex: number;
}

export interface VoiceConfigDto {
  id: string;
  projectId: string;
  role: 'host' | 'guest';
  voiceId: string;
  provider: 'volcengine' | 'azure' | 'mock';
}

export interface BgmConfigDto {
  id: string;
  projectId: string;
  segment: 'intro' | 'body' | 'outro';
  bgmTrackId: string;
  volume: number; // 0-100
  fadeInMs: number;
  fadeOutMs: number;
}

export interface ProjectDto {
  id: string;
  userId?: string | null;
  title: string;
  mode: ProjectMode;
  status: ProjectStatus;
  progress: number; // 0-100
  currentStage?: GenerationStage | null;
  createdAt: string;
  updatedAt: string;
  books?: ProjectBookDto[];
  voices?: VoiceConfigDto[];
  bgmConfigs?: BgmConfigDto[];
  scriptId?: string | null;
  audioUrl?: string | null;
  durationMs?: number | null;
}

export interface CreateProjectPayload {
  title: string;
  mode: ProjectMode;
  isbns: string[];
  voices: Array<Pick<VoiceConfigDto, 'role' | 'voiceId' | 'provider'>>;
  bgmConfigs: Array<{
    segment: 'intro' | 'body' | 'outro';
    bgmTrackId: string;
    volume: number;
    fadeInMs: number;
    fadeOutMs: number;
  }>;
  voiceVolume?: number;
  subtitleEnabled?: boolean;
}

export interface UpdateConfigPayload {
  title?: string;
  voices?: Array<Pick<VoiceConfigDto, 'role' | 'voiceId' | 'provider'>>;
  bgmConfigs?: Array<{
    segment: 'intro' | 'body' | 'outro';
    bgmTrackId: string;
    volume: number;
    fadeInMs: number;
    fadeOutMs: number;
  }>;
  voiceVolume?: number;
  subtitleEnabled?: boolean;
}
