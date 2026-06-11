import { request } from './client';
import type { BookMetadata, FetchMetadataResult, BgmTrackDto, BgmCategory } from '@shared/book';

export const bookApi = {
  async fetchMetadata(isbns: string[], projectId: string): Promise<FetchMetadataResult> {
    return request<FetchMetadataResult>({ method: 'POST', url: '/api/books/metadata', data: { isbns, projectId } });
  },
  async getJob(jobId: string): Promise<{ status: string }> {
    return request<{ status: string }>({ method: 'GET', url: `/api/books/metadata/${jobId}` });
  },
  async listBgm(): Promise<BgmTrackDto[]> {
    return request<BgmTrackDto[]>({ method: 'GET', url: '/api/bgm/tracks' });
  },
  async listBgmCategories(): Promise<BgmCategory[]> {
    return request<BgmCategory[]>({ method: 'GET', url: '/api/bgm/categories' });
  },
};

export type { BookMetadata };
