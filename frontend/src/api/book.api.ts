import { request } from './client';
import type {
  BookLibraryItem,
  BookLibraryListResult,
  BookLibrarySyncStartResult,
  BookLibrarySyncStatusFilter,
  BookLibrarySyncStatusResult,
  BookMetadata,
  BookRankImportPayload,
  BookRankImportResult,
  FetchMetadataResult,
  GenerateLivePitchResult,
  ResolveMetadataResult,
  BgmTrackDto,
  BgmCategory,
} from '@shared/book';

export const bookApi = {
  async fetchMetadata(isbns: string[], projectId: string): Promise<FetchMetadataResult> {
    return request<FetchMetadataResult>({ method: 'POST', url: '/books/metadata', data: { isbns, projectId } });
  },
  async resolveMetadata(isbns: string[]): Promise<ResolveMetadataResult> {
    return request<ResolveMetadataResult>({ method: 'POST', url: '/books/metadata/resolve', data: { isbns } });
  },
  async listLibrary(params: {
    page?: number;
    pageSize?: number;
    q?: string;
    source?: string;
    category?: string;
    syncStatus?: BookLibrarySyncStatusFilter;
  } = {}): Promise<BookLibraryListResult> {
    return request<BookLibraryListResult>({ method: 'GET', url: '/books/library', params });
  },
  async getDetail(isbn: string): Promise<BookLibraryItem | null> {
    return request<BookLibraryItem | null>({ method: 'GET', url: `/books/library/${isbn}` });
  },
  async updatePitch(isbn: string, livePitch: string): Promise<BookLibraryItem> {
    return request<BookLibraryItem>({ method: 'PATCH', url: `/books/library/${isbn}`, data: { livePitch } });
  },
  async generatePitch(isbn: string): Promise<GenerateLivePitchResult> {
    return request<GenerateLivePitchResult>({ method: 'POST', url: `/books/library/${isbn}/pitch/generate` });
  },
  async importBookRank(payload: BookRankImportPayload): Promise<BookRankImportResult> {
    return request<BookRankImportResult>({ method: 'POST', url: '/books/library/import/bookrank', data: payload });
  },
  async syncLibrary(): Promise<BookLibrarySyncStartResult> {
    return request<BookLibrarySyncStartResult>({ method: 'POST', url: '/books/library/sync' });
  },
  async getLibrarySyncStatus(): Promise<BookLibrarySyncStatusResult> {
    return request<BookLibrarySyncStatusResult>({ method: 'GET', url: '/books/library/sync/status' });
  },
  async getJob(jobId: string): Promise<{ status: string }> {
    return request<{ status: string }>({ method: 'GET', url: `/books/metadata/${jobId}` });
  },
  async listBgm(): Promise<BgmTrackDto[]> {
    return request<BgmTrackDto[]>({ method: 'GET', url: '/bgm/tracks' });
  },
  async listBgmCategories(): Promise<BgmCategory[]> {
    return request<BgmCategory[]>({ method: 'GET', url: '/bgm/categories' });
  },
};

export type { BookMetadata };
