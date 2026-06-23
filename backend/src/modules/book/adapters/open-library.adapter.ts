import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import type { BookApiAdapter } from './book-api.adapter';
import type { BookMetadata } from '@shared/book';

type OpenLibraryText = string | { value?: string } | null | undefined;
type OpenLibraryNamedValue = { name?: string };
type OpenLibraryTocItem = { title?: string };

interface OpenLibraryDataBook {
  key?: string;
  title?: string;
  subtitle?: string;
  authors?: Array<{ name: string }>;
  cover?: { medium?: string };
  publishers?: Array<{ name: string }>;
  publish_date?: string;
  number_of_pages?: number;
  notes?: OpenLibraryText;
  subjects?: OpenLibraryNamedValue[];
  subject_people?: OpenLibraryNamedValue[];
  subject_times?: OpenLibraryNamedValue[];
  table_of_contents?: OpenLibraryTocItem[];
}

interface OpenLibraryEdition {
  title?: string;
  subtitle?: string;
  by_statement?: string;
  authors?: Array<{ name?: string; key?: string }>;
  covers?: number[];
  description?: OpenLibraryText;
  notes?: OpenLibraryText;
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  subjects?: string[];
  table_of_contents?: OpenLibraryTocItem[];
  works?: Array<{ key?: string }>;
}

interface OpenLibraryWork {
  description?: OpenLibraryText;
}

/**
 * OpenLibraryAdapter (primary)
 * - Falls back only to a curated mock dataset when network is unreachable
 *   (e.g. local dev without internet, or OPENLIBRARY_BASE mis-configured).
 * - Unknown ISBNs return null so the Google Books fallback can resolve them.
 */
@Injectable()
export class OpenLibraryAdapter implements BookApiAdapter {
  readonly name = 'openlibrary';
  private readonly logger = new Logger(OpenLibraryAdapter.name);
  private readonly http = axios.create({
    timeout: 8000,
    headers: { 'User-Agent': 'PodcastPlatform/1.0 (book metadata resolver)' },
  });
  private cache = new Map<string, { data: BookMetadata; ts: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000;
  private unavailableUntil = 0;

  constructor(private readonly config: ConfigService) {
    axiosRetry(this.http, { retries: 0 });
  }

  async fetchByIsbn(isbn: string): Promise<BookMetadata | null> {
    const cached = this.cache.get(isbn);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) return cached.data;
    if (Date.now() < this.unavailableUntil) return this.mockLookup(isbn);

    const base = this.config.get<string>('thirdParty.openLibrary.base');
    if (!base) return this.mockLookup(isbn);

    try {
      const url = `${base}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
      const resp = await this.http.get<Record<string, unknown>>(url);
      const data = resp.data[`ISBN:${isbn}`] as OpenLibraryDataBook | undefined;
      if (!data) return null;
      const edition = await this.fetchEdition(base, isbn, data.key);
      const editionSummary = this.pickRealDescription(edition?.description);
      const workSummary = edition?.works?.[0]?.key ? await this.fetchWorkSummary(base, edition.works[0].key) : null;
      const summary =
        editionSummary ?? workSummary ?? this.buildCatalogSummary(data, edition);
      const meta: BookMetadata = {
        isbn,
        title: data.title ?? edition?.title ?? `Untitled (${isbn})`,
        author: (data.authors ?? []).map((a) => a.name).join(', ') || edition?.by_statement || 'Unknown',
        coverUrl: data.cover?.medium ?? this.coverFromEdition(edition) ?? null,
        summary,
        publisher: data.publishers?.[0]?.name ?? edition?.publishers?.[0] ?? null,
        publishedDate: data.publish_date ?? edition?.publish_date ?? null,
        pageCount: data.number_of_pages ?? edition?.number_of_pages ?? null,
        source: 'openlibrary',
      };
      this.cache.set(isbn, { data: meta, ts: Date.now() });
      return meta;
    } catch (e) {
      if (axios.isAxiosError(e) && !e.response && e.code !== 'ECONNABORTED') {
        this.unavailableUntil = Date.now() + 5_000;
      }
      this.logger.warn(`OpenLibrary unreachable, falling back to mock: ${(e as Error).message}`);
      return this.mockLookup(isbn);
    }
  }

  private async fetchEdition(base: string, isbn: string, editionKey?: string): Promise<OpenLibraryEdition | null> {
    try {
      const resp = await this.http.get<OpenLibraryEdition>(`${base}/isbn/${isbn}.json`);
      return resp.data;
    } catch (e) {
      this.logger.debug?.(`OpenLibrary edition details unavailable for ${isbn}: ${(e as Error).message}`);
      if (!editionKey) return null;
    }

    try {
      const resp = await this.http.get<OpenLibraryEdition>(`${base}${editionKey}.json`);
      return resp.data;
    } catch (e) {
      this.logger.debug?.(`OpenLibrary edition key details unavailable for ${isbn}: ${(e as Error).message}`);
      return null;
    }
  }

  private async fetchWorkSummary(base: string, workKey: string): Promise<string | null> {
    try {
      const resp = await this.http.get<OpenLibraryWork>(`${base}${workKey}.json`);
      return this.pickRealDescription(resp.data.description);
    } catch (e) {
      this.logger.debug?.(`OpenLibrary work details unavailable for ${workKey}: ${(e as Error).message}`);
      return null;
    }
  }

  private pickRealDescription(value: OpenLibraryText): string | null {
    const raw = typeof value === 'string' ? value : value?.value;
    if (!raw) return null;

    const cleaned = raw
      .replace(/<[^>]+>/g, '')
      .replace(/\[[^\]]+\]\([^)]+\)/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+--\s*(front|back)\s+(flap|cover)$/i, '')
      .trim();

    if (cleaned.length < 40) return null;
    if (/^(u\.?s\.?|usa|can|uk|us)(\s*\/\s*(can|us|uk))*$/i.test(cleaned)) return null;
    if (/^\d+\s*p\.\s*;?/i.test(cleaned)) return null;
    if (/\bLexile\b/i.test(cleaned) && cleaned.length < 100) return null;
    if (/^Includes\s+(bibliographical references|index)/i.test(cleaned)) return null;

    return cleaned;
  }

  private buildCatalogSummary(data: OpenLibraryDataBook, edition: OpenLibraryEdition | null): string | null {
    const title = this.cleanText(data.title ?? edition?.title);
    if (!title) return null;

    const subtitle = this.cleanText(data.subtitle ?? edition?.subtitle);
    const author = this.cleanText((data.authors ?? []).map((item) => item.name).join(', ') || edition?.by_statement);
    const subjects = this.unique([
      ...this.namedValues(data.subjects),
      ...this.namedValues(data.subject_people),
      ...this.namedValues(data.subject_times),
      ...(edition?.subjects ?? []),
    ])
      .filter((item) => !this.isWeakCatalogTerm(item))
      .slice(0, 6);
    const toc = this.unique([...(data.table_of_contents ?? []), ...(edition?.table_of_contents ?? [])]
      .map((item) => this.cleanText(item.title))
      .filter(Boolean) as string[])
      .slice(0, 4);
    const note = this.pickCatalogNote(edition?.notes ?? data.notes);
    const hasCatalogDetail = subtitle || subjects.length > 0 || toc.length > 0 || note;
    if (!hasCatalogDetail) return null;

    const parts = [`${title}${subtitle ? `：${subtitle}` : ''}`];
    if (author) parts.push(`作者/编者为 ${author}`);
    if (subjects.length > 0) parts.push(`主题包括 ${subjects.join('、')}`);
    if (toc.length > 0) parts.push(`目录覆盖 ${toc.join('、')}`);
    if (note) parts.push(note);

    return `Open Library 目录信息显示：${parts.join('；')}。`;
  }

  private pickCatalogNote(value: OpenLibraryText): string | null {
    const raw = typeof value === 'string' ? value : value?.value;
    const cleaned = this.cleanText(raw);
    if (!cleaned) return null;
    const usefulLines = cleaned
      .split(/(?:(?:\r?\n)+|;\s*)/)
      .map((line) => this.cleanText(line.replace(/\.$/, '')))
      .filter(Boolean)
      .filter((line) => !/^Includes\s+(index|bibliographical references)$/i.test(line))
      .slice(0, 2);
    return usefulLines.length > 0 ? `备注：${usefulLines.join('；')}` : null;
  }

  private namedValues(values: OpenLibraryNamedValue[] | undefined): string[] {
    return (values ?? []).map((item) => this.cleanText(item.name)).filter(Boolean) as string[];
  }

  private unique(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => this.cleanText(value)).filter(Boolean) as string[]));
  }

  private cleanText(value: string | null | undefined): string {
    return value
      ?.replace(/<[^>]+>/g, '')
      .replace(/\[[^\]]+\]\([^)]+\)/g, '')
      .replace(/\s+/g, ' ')
      .trim() ?? '';
  }

  private isWeakCatalogTerm(value: string): boolean {
    return /^(general|quality or trade paperback|juvenile literature|fiction|nonfiction)$/i.test(value.trim());
  }

  private coverFromEdition(edition: OpenLibraryEdition | null): string | null {
    const coverId = edition?.covers?.[0];
    return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null;
  }

  private mockLookup(isbn: string): BookMetadata | null {
    if (this.config.get<boolean>('thirdParty.bookMetadata.allowMock') !== true) return null;

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
    return mock.find((m) => m.isbn === isbn) ?? null;
  }
}
