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

/**
 * 封面识别候选项（与后端 CoverRecognizeCandidate 对齐）
 */
export interface CoverRecognizeCandidate {
  isbn: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  summary?: string | null;
  publisher?: string | null;
  publishedDate?: string | null;
  pageCount?: number | null;
}

/**
 * 封面识别返回的原始识别信息
 */
export interface CoverRawRecognition {
  title: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  publishedYear?: string;
  language?: string;
  confidence?: 'high' | 'medium' | 'low' | 'unknown';
}

/**
 * 封面识别结果
 */
export interface CoverRecognizeResult {
  candidates: CoverRecognizeCandidate[];
  rawRecognition: CoverRawRecognition | null;
}

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
  /**
   * 根据 ISBN 直接解析候选图书（条码扫描命中后快速定位）
   * @param isbn 已归一化的 ISBN
   */
  async resolveCoverByIsbn(isbn: string): Promise<CoverRecognizeResult> {
    return request<CoverRecognizeResult>({
      method: 'POST',
      url: '/books/cover/resolve-isbn',
      data: { isbn },
    });
  },

  /**
   * 按书名搜索候选图书（/scan 页面就地搜索兜底）
   * @param title 书名关键词
   */
  async searchCoverCandidates(title: string): Promise<CoverRecognizeResult> {
    return request<CoverRecognizeResult>({
      method: 'POST',
      url: '/books/cover/search',
      data: { title },
    });
  },

  /**
   * 上传封面图片，后端调 agnes-2.0-flash 识别 + Google Books 搜索候选
   * @param file 图片文件（JPEG/PNG，<=5MB）
   */
  async recognizeCover(file: File): Promise<CoverRecognizeResult> {
    const formData = new FormData();
    formData.append('file', file);
    return request<CoverRecognizeResult>({
      method: 'POST',
      url: '/books/cover/recognize',
      data: formData,
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
  },
};

export type { BookMetadata };
