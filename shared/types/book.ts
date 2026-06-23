export interface BookMetadata {
  isbn: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  summary?: string | null;
  podcastAngle?: string | null;
  publisher?: string | null;
  publishedDate?: string | null;
  pageCount?: number | null;
  source: 'openlibrary' | 'googlebooks' | 'mock' | 'bookrank';
}

export type BookMetadataSyncStatus = 'pending' | 'syncing' | 'synced' | 'partial' | 'failed';

export interface FetchMetadataPayload {
  isbns: string[];
}

export interface FetchMetadataResult {
  jobId: string;
  items: BookMetadata[];
  failed: Array<{ isbn: string; reason: string }>;
}

export interface ResolveMetadataResult {
  items: BookMetadata[];
  failed: Array<{ isbn: string; reason: string }>;
}

export interface BookLibraryItem extends BookMetadata {
  id: string;
  category?: string | null;
  categoryName?: string | null;
  rank?: number | null;
  queryCount: number;
  metadataSyncStatus: BookMetadataSyncStatus;
  metadataSyncAttempts: number;
  metadataSyncedAt?: string | null;
  metadataSyncError?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface BookLibraryListResult {
  items: BookLibraryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BookRankImportPayload {
  kind: 'bestsellers' | 'new-books';
  category?: string;
  limit?: number;
}

export interface BookRankImportResult {
  imported: number;
  items: BookLibraryItem[];
}

export interface BookLibrarySyncStatusResult {
  running: boolean;
  total: number;
  processed: number;
  updated: number;
  partial?: number;
  failed: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  currentIsbn?: string | null;
  lastError?: string | null;
}

export interface BookLibrarySyncStartResult {
  accepted: boolean;
  status: BookLibrarySyncStatusResult;
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
  provider: 'xiaomi' | 'volcengine' | 'azure' | 'mock';
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
