import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import type { BookApiAdapter } from './book-api.adapter';
import type { BookMetadata } from '@shared/book';

/**
 * GoogleBooksAdapter (fallback)
 * - Returns mock data when AZURE/GOOGLE_BOOKS_BASE is unreachable.
 */
@Injectable()
export class GoogleBooksAdapter implements BookApiAdapter {
  readonly name = 'googlebooks';
  private readonly logger = new Logger(GoogleBooksAdapter.name);
  private readonly http = axios.create({ timeout: 5000 });

  constructor(private readonly config: ConfigService) {
    axiosRetry(this.http, { retries: 2, retryDelay: axiosRetry.exponentialDelay });
  }

  async fetchByIsbn(isbn: string): Promise<BookMetadata | null> {
    const base = this.config.get<string>('thirdParty.googleBooks.base');
    if (!base) return this.mockLookup(isbn);
    try {
      const url = `${base}/volumes?q=isbn:${isbn}`;
      const resp = await this.http.get<{ items?: Array<{ volumeInfo?: Record<string, unknown> }> }>(url);
      const vi = resp.data.items?.[0]?.volumeInfo;
      if (!vi) return this.mockLookup(isbn);
      return {
        isbn,
        title: (vi.title as string) ?? `Untitled (${isbn})`,
        author: Array.isArray(vi.authors) ? (vi.authors as string[]).join(', ') : 'Unknown',
        coverUrl: (vi.imageLinks as { thumbnail?: string } | undefined)?.thumbnail ?? null,
        summary: (vi.description as string) ?? null,
        publisher: (vi.publisher as string) ?? null,
        publishedDate: (vi.publishedDate as string) ?? null,
        pageCount: (vi.pageCount as number) ?? null,
        source: 'googlebooks',
      };
    } catch (e) {
      this.logger.warn(`GoogleBooks unreachable, falling back to mock: ${(e as Error).message}`);
      return this.mockLookup(isbn);
    }
  }

  private mockLookup(isbn: string): BookMetadata {
    return {
      isbn,
      title: `GoogleBooks 占位 (${isbn})`,
      author: 'Mock Author',
      coverUrl: `https://placehold.co/200x200?text=GB+${isbn.slice(-4)}`,
      summary: 'GoogleBooksAdapter 离线 mock 数据。',
      source: 'mock',
    };
  }
}
