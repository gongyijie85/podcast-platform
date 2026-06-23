import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import type { BookApiAdapter } from './book-api.adapter';
import type { BookMetadata } from '@shared/book';

/**
 * GoogleBooksAdapter (fallback).
 * Generic placeholder books are not returned in production; unresolved ISBNs
 * should surface as failures so the library is not polluted with fake metadata.
 */
@Injectable()
export class GoogleBooksAdapter implements BookApiAdapter {
  readonly name = 'googlebooks';
  private readonly logger = new Logger(GoogleBooksAdapter.name);
  private readonly http = axios.create({ timeout: 3000 });
  private unavailableUntil = 0;

  constructor(private readonly config: ConfigService) {
    axiosRetry(this.http, { retries: 0 });
  }

  async fetchByIsbn(isbn: string): Promise<BookMetadata | null> {
    if (Date.now() < this.unavailableUntil) {
      return this.mockLookup(isbn);
    }

    const base = this.config.get<string>('thirdParty.googleBooks.base');
    const apiKey = this.config.get<string>('thirdParty.googleBooks.apiKey');
    if (!base) return this.mockLookup(isbn);
    try {
      const resp = await this.http.get<{ items?: Array<{ volumeInfo?: Record<string, unknown> }> }>(
        `${base}/volumes`,
        {
          params: {
            q: `isbn:${isbn}`,
            fields: 'items(volumeInfo(title,authors,imageLinks/thumbnail,description,publisher,publishedDate,pageCount))',
            ...(apiKey ? { key: apiKey } : {}),
          },
        },
      );
      const vi = resp.data.items?.[0]?.volumeInfo;
      if (!vi) return null;
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
      if (axios.isAxiosError(e) && e.response?.status === 429) {
        this.unavailableUntil = Date.now() + 60_000;
      }
      this.logger.warn(`GoogleBooks unreachable, falling back to mock: ${(e as Error).message}`);
      return this.mockLookup(isbn);
    }
  }

  private mockLookup(isbn: string): BookMetadata | null {
    if (this.config.get<boolean>('thirdParty.bookMetadata.allowMock') !== true) return null;

    const curated: Record<string, BookMetadata> = {
      '9780241662151': {
        isbn,
        title: 'The Creative Act: A Way of Being',
        author: 'Rick Rubin',
        coverUrl: `https://placehold.co/200x200?text=Creative`,
        summary: '音乐制作人 Rick Rubin 关于创造力、感知、实践与作品诞生方式的思考。',
        publisher: 'Penguin Press',
        publishedDate: '2023',
        source: 'mock',
      },
    };
    if (curated[isbn]) return curated[isbn];
    return null;
  }
}
