import type { BookMetadata } from './book';

export type ProjectMode = 'independent' | 'merged';
export type ScriptTemplate = 'default' | 'deep-review' | 'casual-talk' | 'academic' | 'audio-overview';
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
  publisher?: string | null;
  publishedDate?: string | null;
  metadataSource?: BookMetadata['source'] | null;
  podcastAngle?: string | null;
  orderIndex: number;
}

export interface VoiceConfigDto {
  id: string;
  projectId: string;
  role: 'host' | 'guest';
  voiceId: string;
  provider: 'xiaomi' | 'volcengine' | 'azure' | 'mock';
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
  coverUrl?: string | null;
  mode: ProjectMode;
  scriptTemplate?: ScriptTemplate | null;
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

export interface SyncProjectsPayload {
  projectIds: string[];
}

export interface SyncProjectsResult {
  synced: number;
}

export interface ShareLinkDto {
  token: string;
  projectId: string;
  url: string;
  expiresAt: string;
}

export interface SharedProjectDto {
  project: ProjectDto;
  share: Omit<ShareLinkDto, 'url'>;
}

export interface CreateProjectPayload {
  title: string;
  mode: ProjectMode;
  isbns: string[];
  books?: BookMetadata[];
  scriptTemplate?: ScriptTemplate;
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

export interface GenerateProjectPayload {
  scriptTemplate?: ScriptTemplate;
}

export type RevisionPreset = 'deeper' | 'less-filler' | 'lighter' | 'shorter' | 'more-cross-book';

export interface RegenerateProjectPayload {
  scriptTemplate?: ScriptTemplate;
  revisionPreset?: RevisionPreset;
  customInstruction?: string;
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
