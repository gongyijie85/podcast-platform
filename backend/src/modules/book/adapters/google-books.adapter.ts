import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import type { BookApiAdapter } from './book-api.adapter';
import type { BookMetadata } from '@shared/book';
import { isbnToIsbn13, normalizeIsbn } from '../../../common/utils/isbn';

type GoogleIndustryIdentifier = {
  type?: string;
  identifier?: string;
};

type GoogleImageLinks = {
  smallThumbnail?: string;
  thumbnail?: string;
};

type GoogleVolumeInfo = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  imageLinks?: GoogleImageLinks;
  description?: string;
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  industryIdentifiers?: GoogleIndustryIdentifier[];
  language?: string;
  categories?: string[];
  previewLink?: string;
  infoLink?: string;
  averageRating?: number;
  ratingsCount?: number;
  dimensions?: {
    height?: string;
    width?: string;
    thickness?: string;
  };
};

type GoogleVolume = {
  id?: string;
  volumeInfo?: GoogleVolumeInfo;
};

type GoogleVolumesResponse = {
  items?: GoogleVolume[];
};

/**
 * GoogleBooksAdapter.
 * Generic placeholder books are not returned in production; unresolved ISBNs
 * should surface as failures so the library is not polluted with fake metadata.
 */
@Injectable()
export class GoogleBooksAdapter implements BookApiAdapter {
  readonly name = 'googlebooks';
  private readonly logger = new Logger(GoogleBooksAdapter.name);
  private readonly http = axios.create({ timeout: 8000 });
  private readonly cache = new Map<string, { data: BookMetadata; ts: number }>();
  private readonly cacheTtlMs = 10 * 60 * 1000;
  private unavailableUntil = 0;

  constructor(private readonly config: ConfigService) {
    axiosRetry(this.http, {
      retries: 1,
      retryDelay: () => 500,
      retryCondition: (error) => {
        const status = error.response?.status ?? 0;
        return status === 429 || status >= 500 || error.code === 'ECONNABORTED' || !error.response;
      },
    });
  }

  async fetchByIsbn(isbn: string): Promise<BookMetadata | null> {
    const lookupIsbn = this.cleanIdentifier(isbn);
    const cached = this.cache.get(lookupIsbn);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) return cached.data;

    if (Date.now() < this.unavailableUntil) {
      return this.mockLookup(lookupIsbn);
    }

    const base = this.config.get<string>('thirdParty.googleBooks.base');
    const apiKey = this.config.get<string>('thirdParty.googleBooks.apiKey');
    if (!base) return this.mockLookup(lookupIsbn);
    try {
      const exactItems = await this.searchExactCandidates(base, lookupIsbn, apiKey);
      const fallbackItems = exactItems.length > 0 ? [] : await this.searchVolumes(base, apiKey, lookupIsbn);
      const selected = this.pickBestVolume(lookupIsbn, [...exactItems, ...fallbackItems]);
      if (!selected?.volumeInfo) return null;

      const detail = selected.id ? await this.fetchVolumeDetail(base, selected.id, apiKey) : null;
      const volume = this.mergeVolume(selected, detail);
      const metadata = this.toMetadata(lookupIsbn, volume);
      if (metadata) this.cache.set(lookupIsbn, { data: metadata, ts: Date.now() });
      return metadata;
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 429) {
        this.unavailableUntil = Date.now() + 60_000;
      }
      this.logger.warn(`GoogleBooks unreachable, falling back to mock: ${(e as Error).message}`);
      return this.mockLookup(lookupIsbn);
    }
  }

  /**
   * 按书名+作者搜索候选图书（用于封面识别后的候选列表）。
   * 不走缓存（搜索结果变化大），最多返回 5 本，仅返回有 ISBN 的条目。
   * 出错或无结果返回空数组。
   */
  async searchByTitle(title: string, author?: string): Promise<BookMetadata[]> {
    const cleanedTitle = this.clean(title);
    if (!cleanedTitle) return [];

    const base = this.config.get<string>('thirdParty.googleBooks.base');
    const apiKey = this.config.get<string>('thirdParty.googleBooks.apiKey');
    if (!base) return [];

    let query = `intitle:${encodeURIComponent(cleanedTitle)}`;
    const cleanedAuthor = this.clean(author);
    if (cleanedAuthor) {
      query += `+inauthor:${encodeURIComponent(cleanedAuthor)}`;
    }

    try {
      const items = await this.searchVolumes(base, apiKey, query);
      const deduped = this.dedupeVolumes(items);
      const result: BookMetadata[] = [];
      for (const volume of deduped) {
        if (!volume.volumeInfo?.title) continue;
        const isbn = this.pickIsbnFromVolume(volume);
        if (!isbn) continue;
        const metadata = this.toMetadata(isbn, volume);
        if (metadata) result.push(metadata);
        if (result.length >= 5) break;
      }
      return result;
    } catch (e) {
      this.logger.warn(`GoogleBooks searchByTitle failed: ${(e as Error).message}`);
      return [];
    }
  }

  /**
   * 从 volume 的 industryIdentifiers 中提取 ISBN-13（优先）或 ISBN-10
   */
  private pickIsbnFromVolume(volume: GoogleVolume): string | null {
    const ids = volume.volumeInfo?.industryIdentifiers ?? [];
    if (ids.length === 0) return null;
    const isbn13 = ids.find((id) => id.type === 'ISBN_13' && id.identifier);
    if (isbn13?.identifier) return this.cleanIdentifier(isbn13.identifier);
    const isbn10 = ids.find((id) => id.type === 'ISBN_10' && id.identifier);
    if (isbn10?.identifier) return this.cleanIdentifier(isbn10.identifier);
    const anyId = ids.find((id) => id.identifier && /^\d{9,13}[\dXx]$/.test(id.identifier));
    return anyId?.identifier ? this.cleanIdentifier(anyId.identifier) : null;
  }

  private async searchExactCandidates(base: string, isbn: string, apiKey: string | undefined): Promise<GoogleVolume[]> {
    const collected: GoogleVolume[] = [];
    for (const query of this.buildSearchQueries(isbn)) {
      const items = await this.searchVolumes(base, apiKey, query);
      collected.push(...items);
      if (this.hasExactIdentifierMatch(isbn, items)) break;
    }
    return this.dedupeVolumes(collected);
  }

  private async searchVolumes(base: string, apiKey: string | undefined, query: string): Promise<GoogleVolume[]> {
    const resp = await this.http.get<GoogleVolumesResponse>(
      `${base}/volumes`,
      {
        params: {
          q: query,
          maxResults: 5,
          printType: 'books',
          fields: this.listFields(),
          ...(apiKey ? { key: apiKey } : {}),
        },
      },
    );
    return resp.data.items ?? [];
  }

  private async fetchVolumeDetail(base: string, volumeId: string, apiKey: string | undefined): Promise<GoogleVolume | null> {
    try {
      const resp = await this.http.get<GoogleVolume>(
        `${base}/volumes/${encodeURIComponent(volumeId)}`,
        {
          params: {
            fields: this.detailFields(),
            ...(apiKey ? { key: apiKey } : {}),
          },
        },
      );
      return resp.data;
    } catch (e) {
      this.logger.debug?.(`GoogleBooks detail unavailable for ${volumeId}: ${(e as Error).message}`);
      return null;
    }
  }

  private listFields(): string {
    return [
      'items(id,volumeInfo(title,subtitle,authors,imageLinks/smallThumbnail,imageLinks/thumbnail,description,publisher,publishedDate,pageCount,industryIdentifiers,language,categories,previewLink,infoLink,averageRating,ratingsCount,dimensions))',
    ].join(',');
  }

  private detailFields(): string {
    return 'id,volumeInfo(title,subtitle,authors,imageLinks/smallThumbnail,imageLinks/thumbnail,description,publisher,publishedDate,pageCount,industryIdentifiers,language,categories,previewLink,infoLink,averageRating,ratingsCount,dimensions)';
  }

  private pickBestVolume(isbn: string, items: GoogleVolume[]): GoogleVolume | null {
    const targets = this.targetIsbns(isbn);
    const candidates = items
      .filter((item) => Boolean(item.volumeInfo?.title))
      .map((item) => ({
        item,
        score: this.scoreVolume(targets, item),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.item ?? null;
  }

  private scoreVolume(targets: Set<string>, item: GoogleVolume): number {
    const vi = item.volumeInfo;
    if (!vi?.title) return 0;
    const matchesIsbn = Boolean(
      (vi.industryIdentifiers ?? []).some((id) => {
        const candidate = this.cleanIdentifier(id.identifier);
        return Boolean(candidate && targets.has(candidate));
      }),
    );
    let score = matchesIsbn ? 100 : 10;
    if (vi.description && this.cleanDescription(vi.description)) score += 25;
    if (vi.authors?.length) score += 8;
    if (this.pickCover(vi.imageLinks)) score += 4;
    if (vi.publisher) score += 2;
    return score;
  }

  private mergeVolume(base: GoogleVolume, detail: GoogleVolume | null): GoogleVolume {
    if (!detail?.volumeInfo) return base;
    return {
      id: detail.id ?? base.id,
      volumeInfo: {
        ...base.volumeInfo,
        ...detail.volumeInfo,
        imageLinks: {
          ...base.volumeInfo?.imageLinks,
          ...detail.volumeInfo.imageLinks,
        },
        industryIdentifiers: detail.volumeInfo.industryIdentifiers ?? base.volumeInfo?.industryIdentifiers,
      },
    };
  }

  private toMetadata(isbn: string, volume: GoogleVolume): BookMetadata | null {
    const vi = volume.volumeInfo;
    if (!vi?.title) return null;
    return {
      isbn,
      title: this.titleWithSubtitle(vi.title, vi.subtitle),
      author: Array.isArray(vi.authors) && vi.authors.length > 0 ? vi.authors.join(', ') : 'Unknown',
      coverUrl: this.pickCover(vi.imageLinks),
      summary: this.cleanDescription(vi.description),
      publisher: this.cleanNullable(vi.publisher),
      publishedDate: this.cleanNullable(vi.publishedDate),
      pageCount: typeof vi.pageCount === 'number' && vi.pageCount > 0 ? vi.pageCount : null,
      source: 'googlebooks',
      enrichment: this.toEnrichment(vi),
    };
  }

  private toEnrichment(vi: GoogleVolumeInfo): BookMetadata['enrichment'] {
    const fetchedAt = new Date().toISOString();
    const productDetails: Record<string, string | number | boolean | null> = {};
    if (vi.categories?.length) productDetails.categories = vi.categories.join(', ');
    if (vi.previewLink) productDetails.previewLink = vi.previewLink;
    if (vi.infoLink) productDetails.infoLink = vi.infoLink;
    if (vi.dimensions?.height) productDetails.height = vi.dimensions.height;
    if (vi.dimensions?.width) productDetails.width = vi.dimensions.width;
    if (vi.dimensions?.thickness) productDetails.thickness = vi.dimensions.thickness;

    const ratings =
      typeof vi.averageRating === 'number'
        ? [
            {
              label: 'Google Books',
              score: vi.averageRating,
              count: vi.ratingsCount ?? null,
              source: 'googlebooks' as const,
              fetchedAt,
            },
          ]
        : undefined;

    if (!ratings && Object.keys(productDetails).length === 0) return null;
    return {
      ratings,
      productDetails,
      sources: [{ source: 'googlebooks', fetchedAt, url: vi.infoLink ?? vi.previewLink ?? null }],
    };
  }

  private titleWithSubtitle(title: string, subtitle: string | null | undefined): string {
    const cleanTitle = this.clean(title);
    const cleanSubtitle = this.clean(subtitle);
    if (!cleanSubtitle || cleanTitle.toLowerCase().includes(cleanSubtitle.toLowerCase())) return cleanTitle;
    return `${cleanTitle}: ${cleanSubtitle}`;
  }

  private pickCover(images: GoogleImageLinks | null | undefined): string | null {
    const raw = images?.thumbnail ?? images?.smallThumbnail;
    if (!raw) return null;
    return raw.replace(/^http:\/\//i, 'https://');
  }

  private cleanDescription(value: string | null | undefined): string | null {
    const cleaned = this.clean(value)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || cleaned.length < 30) return null;
    if (cleaned === 'GoogleBooksAdapter 离线 mock 数据。') return null;
    return cleaned;
  }

  private cleanNullable(value: string | null | undefined): string | null {
    return this.clean(value) || null;
  }

  private clean(value: string | null | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
  }

  private cleanIdentifier(value: string | null | undefined): string {
    return value?.replace(/[-\s]/g, '').trim().toUpperCase() ?? '';
  }

  private buildSearchQueries(isbn: string): string[] {
    const targets = Array.from(this.targetIsbns(isbn));
    return targets.map((target) => `isbn:${target}`);
  }

  private targetIsbns(isbn: string): Set<string> {
    const cleaned = this.cleanIdentifier(isbn);
    const normalized = normalizeIsbn(cleaned);
    const targets = new Set<string>([cleaned]);
    if (normalized) {
      targets.add(normalized);
      if (normalized.length === 10) {
        const isbn13 = isbnToIsbn13(normalized);
        if (isbn13) targets.add(isbn13);
      }
    }
    return targets;
  }

  private hasExactIdentifierMatch(isbn: string, items: GoogleVolume[]): boolean {
    const targets = this.targetIsbns(isbn);
    return items.some((item) =>
      (item.volumeInfo?.industryIdentifiers ?? []).some((id) => targets.has(this.cleanIdentifier(id.identifier))),
    );
  }

  private dedupeVolumes(items: GoogleVolume[]): GoogleVolume[] {
    const seen = new Set<string>();
    return items.filter((item, index) => {
      const key = item.id ?? `${item.volumeInfo?.title ?? ''}:${item.volumeInfo?.authors?.join(',') ?? ''}:${index}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
