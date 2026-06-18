import { request } from './client';
import type {
  BookLibraryListResult,
  BookMetadata,
  BookRankImportPayload,
  BookRankImportResult,
  FetchMetadataResult,
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
  } = {}): Promise<BookLibraryListResult> {
    return request<BookLibraryListResult>({ method: 'GET', url: '/books/library', params });
  },
  async importBookRank(payload: BookRankImportPayload): Promise<BookRankImportResult> {
    return request<BookRankImportResult>({ method: 'POST', url: '/books/library/import/bookrank', data: payload });
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
