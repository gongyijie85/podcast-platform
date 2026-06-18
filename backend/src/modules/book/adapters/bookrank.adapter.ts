import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import { normalizeIsbn } from '../../../common/utils/isbn';
import type { BookLibraryItem, BookMetadata } from '@shared/book';

interface BookRankBook {
  id?: string | number;
  isbn13?: string;
  isbn10?: string;
  title?: string;
  title_zh?: string;
  author?: string;
  cover?: string;
  cover_url?: string;
  _original_cover?: string;
  description?: string;
  description_zh?: string;
  details?: string;
  details_zh?: string;
  publisher?: string;
  published_date?: string;
  publication_date?: string | null;
  publication_dt?: string;
  page_count?: string | number | null;
  category?: string | null;
  category_id?: string;
  category_name?: string;
  list_name?: string;
  rank?: number;
}

interface BookRankResponse {
  data?: {
    books?: BookRankBook[];
  };
}

export interface BookRankMappedBook extends BookMetadata {
  category?: string | null;
  categoryName?: string | null;
  rank?: number | null;
}

@Injectable()
export class BookRankAdapter {
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>('thirdParty.bookRank.base') || 'https://bookrank-ckml.onrender.com';
    this.http = axios.create({
      baseURL,
      timeout: 25_000,
      headers: {
        'User-Agent': 'podcast-platform/1.0 book-library-import',
        Accept: 'application/json',
      },
    });
  }

  async fetchBestsellers(category: string, limit: number): Promise<BookRankMappedBook[]> {
    const resp = await this.http.get<BookRankResponse>(`/api/public/bestsellers/${encodeURIComponent(category)}`, {
      params: { limit },
    });
    const books = resp.data.data?.books ?? [];
    return books.flatMap((book) => this.mapBook(book, category));
  }

  async fetchNewBooks(limit: number): Promise<BookRankMappedBook[]> {
    const resp = await this.http.get<BookRankResponse>('/api/public/new-books', {
      params: { page: 1, per_page: limit },
    });
    const books = resp.data.data?.books ?? [];
    return books.flatMap((book) => this.mapBook(book, 'new-books'));
  }

  private mapBook(book: BookRankBook, fallbackCategory: string): BookRankMappedBook[] {
    const isbn = normalizeIsbn(String(book.isbn13 || book.id || book.isbn10 || ''));
    if (!isbn) return [];
    const title = this.clean(book.title) || this.clean(book.title_zh);
    const author = this.clean(book.author);
    if (!title || !author) return [];

    return [
      {
        isbn,
        title,
        author,
        coverUrl: this.normalizeCover(book._original_cover || book.cover_url || book.cover),
        summary: this.pickSummary(book),
        publisher: this.clean(book.publisher),
        publishedDate: this.clean(book.publication_dt || book.publication_date || book.published_date),
        pageCount: this.parsePositiveInt(book.page_count),
        source: 'bookrank',
        category: this.clean(book.category_id || book.category) || fallbackCategory,
        categoryName: this.clean(book.category_name || book.list_name),
        rank: this.parsePositiveInt(book.rank),
      },
    ];
  }

  private pickSummary(book: BookRankBook): string | null {
    return (
      this.clean(book.details_zh) ||
      this.clean(book.details) ||
      this.clean(book.description_zh) ||
      this.clean(book.description)
    );
  }

  private normalizeCover(value?: string | null): string | null {
    const cover = this.clean(value);
    if (!cover) return null;
    if (/^https?:\/\//i.test(cover)) return cover;
    const base = (this.config.get<string>('thirdParty.bookRank.base') || 'https://bookrank-ckml.onrender.com').replace(/\/$/, '');
    return `${base}/${cover.replace(/^\//, '')}`;
  }

  private parsePositiveInt(value: unknown): number | null {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private clean(value?: string | number | null): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/\s+/g, ' ').trim();
    if (!text || text === '未知') return null;
    return text;
  }
}
