import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import type { BookApiAdapter } from './book-api.adapter';
import type { BookMetadata } from '@shared/book';

/**
 * OpenLibraryAdapter (primary)
 * - Falls back to a curated mock dataset when network is unreachable
 *   (e.g. local dev without internet, or OPENLIBRARY_BASE mis-configured).
 */
@Injectable()
export class OpenLibraryAdapter implements BookApiAdapter {
  readonly name = 'openlibrary';
  private readonly logger = new Logger(OpenLibraryAdapter.name);
  private readonly http = axios.create({ timeout: 5000 });
  private cache = new Map<string, { data: BookMetadata; ts: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(private readonly config: ConfigService) {
    axiosRetry(this.http, { retries: 2, retryDelay: axiosRetry.exponentialDelay });
  }

  async fetchByIsbn(isbn: string): Promise<BookMetadata | null> {
    const cached = this.cache.get(isbn);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) return cached.data;

    const base = this.config.get<string>('thirdParty.openLibrary.base');
    if (!base) return this.mockLookup(isbn);

    try {
      const url = `${base}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
      const resp = await this.http.get<Record<string, unknown>>(url);
      const data = resp.data[`ISBN:${isbn}`] as
        | { title?: string; authors?: Array<{ name: string }>; cover?: { medium?: string }; notes?: string; publishers?: Array<{ name: string }>; publish_date?: string; number_of_pages?: number }
        | undefined;
      if (!data) return this.mockLookup(isbn);
      const meta: BookMetadata = {
        isbn,
        title: data.title ?? `Untitled (${isbn})`,
        author: (data.authors ?? []).map((a) => a.name).join(', ') || 'Unknown',
        coverUrl: data.cover?.medium ?? null,
        summary: data.notes ?? null,
        publisher: data.publishers?.[0]?.name ?? null,
        publishedDate: data.publish_date ?? null,
        pageCount: data.number_of_pages ?? null,
        source: 'openlibrary',
      };
      this.cache.set(isbn, { data: meta, ts: Date.now() });
      return meta;
    } catch (e) {
      this.logger.warn(`OpenLibrary unreachable, falling back to mock: ${(e as Error).message}`);
      return this.mockLookup(isbn);
    }
  }

  private mockLookup(isbn: string): BookMetadata | null {
    const mock: BookMetadata[] = [
      {
        isbn: '9787121362200',
        title: '人类简史',
        author: '尤瓦尔·赫拉利',
        coverUrl: 'https://placehold.co/200x200?text=Sapiens',
        summary: '从动物到上帝的人类发展史，宏大的叙事视角。',
        publisher: '中信出版社',
        publishedDate: '2017',
        pageCount: 440,
        source: 'mock',
      },
      {
        isbn: '9787508672069',
        title: '思考，快与慢',
        author: '丹尼尔·卡尼曼',
        coverUrl: 'https://placehold.co/200x200?text=Thinking',
        summary: '诺贝尔奖得主卡尼曼介绍人类两种思维模式。',
        publisher: '中信出版社',
        publishedDate: '2012',
        pageCount: 424,
        source: 'mock',
      },
      {
        isbn: '9787508648286',
        title: '黑客与画家',
        author: 'Paul Graham',
        coverUrl: 'https://placehold.co/200x200?text=Hackers',
        summary: '创业之父 Paul Graham 对编程与创业的洞察。',
        publisher: '人民邮电出版社',
        publishedDate: '2013',
        pageCount: 264,
        source: 'mock',
      },
      {
        isbn: '9787508668314',
        title: '未来简史',
        author: '尤瓦尔·赫拉利',
        coverUrl: 'https://placehold.co/200x200?200x200',
        summary: '智人征服世界之后，智神或将征服自己。',
        publisher: '中信出版社',
        publishedDate: '2017',
        pageCount: 416,
        source: 'mock',
      },
      {
        isbn: '9787508649191',
        title: '精益创业',
        author: 'Eric Ries',
        coverUrl: 'https://placehold.co/200x200?text=Lean',
        summary: '用最小可行产品验证商业假设的方法论。',
        publisher: '中信出版社',
        publishedDate: '2012',
        pageCount: 280,
        source: 'mock',
      },
    ];
    return mock.find((m) => m.isbn === isbn) ?? {
      isbn,
      title: `示例书 (${isbn})`,
      author: 'Mock Author',
      coverUrl: `https://placehold.co/200x200?text=${isbn.slice(-4)}`,
      summary: '这是 OpenLibraryAdapter 在离线 / mock 模式下的占位数据。',
      source: 'mock',
    };
  }
}
