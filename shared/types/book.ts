export interface BookMetadata {
  isbn: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  summary?: string | null;
  publisher?: string | null;
  publishedDate?: string | null;
  pageCount?: number | null;
  source: 'openlibrary' | 'googlebooks' | 'mock';
}

export interface FetchMetadataPayload {
  isbns: string[];
}

export interface FetchMetadataResult {
  jobId: string;
  items: BookMetadata[];
  failed: Array<{ isbn: string; reason: string }>;
}

export type BgmCategory = '轻松' | '科技' | '人文' | '纪实';

export interface BgmTrackDto {
  id: string;
  name: string;
  category: BgmCategory;
  storageKey: string;
  durationMs: number;
  url?: string;
}

export interface TtsVoice {
  id: string;
  name: string;
  provider: 'volcengine' | 'azure' | 'mock';
  gender: 'male' | 'female' | 'child';
  description: string;
  language: string;
  previewUrl?: string;
}

export interface TtsPreviewPayload {
  voiceId: string;
  text: string;
  emotion?: string;
}

export interface TtsPreviewResult {
  url: string;
  durationMs: number;
  format: 'mp3';
}
