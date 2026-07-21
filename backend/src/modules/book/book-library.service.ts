import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BookRankAdapter, type BookRankMappedBook } from './adapters/bookrank.adapter';
import { isbnToIsbn13, normalizeIsbn } from '../../common/utils/isbn';
import type { BookTranslation } from './translation.service';
import type {
  BookEnrichment,
  BookLibraryItem,
  BookLibraryListResult,
  BookLibrarySyncStatusFilter,
  BookMetadata,
  BookMetadataSyncStatus,
  BookRankImportPayload,
  BookRankImportResult,
} from '@shared/book';

interface LibraryListOptions {
  page?: number;
  pageSize?: number;
  q?: string;
  source?: string;
  category?: string;
  syncStatus?: string;
}

@Injectable()
export class BookLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookRank: BookRankAdapter,
  ) {}

  async list(options: LibraryListOptions): Promise<BookLibraryListResult> {
    const page = this.clampInt(options.page, 1, 9999, 1);
    const pageSize = this.clampInt(options.pageSize, 1, 50, 10);
    const where = this.buildWhere(options);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bookLibraryItem.findMany({
        where,
        orderBy: [{ lastSeenAt: 'desc' }, { firstSeenAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.bookLibraryItem.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toDto(item)),
      total,
      page,
      pageSize,
    };
  }

  async findByIsbns(isbns: string[]): Promise<BookLibraryItem[]> {
    const normalized = Array.from(new Set(isbns.map((isbn) => normalizeIsbn(isbn)).filter(Boolean) as string[]));
    if (normalized.length === 0) return [];
    const items = await this.prisma.bookLibraryItem.findMany({
      where: { isbn: { in: normalized } },
    });
    const byIsbn = new Map(items.map((item) => [item.isbn, item]));
    return normalized.flatMap((isbn) => {
      const item = byIsbn.get(isbn);
      return item ? [this.toDto(item)] : [];
    });
  }

  /**
   * 按 ISBN 查询单本详情（含口播稿）
   */
  async findByIsbn(isbn: string): Promise<BookLibraryItem | null> {
    const normalized = normalizeIsbn(isbn);
    if (!normalized) return null;
    const direct = await this.prisma.bookLibraryItem.findUnique({ where: { isbn: normalized } });
    if (direct) return this.toDto(direct);

    // Scanners may return ISBN-10 while the library stores the canonical ISBN-13.
    if (normalized.length === 10) {
      const isbn13 = isbnToIsbn13(normalized);
      if (isbn13) {
        const converted = await this.prisma.bookLibraryItem.findUnique({ where: { isbn: isbn13 } });
        if (converted) return this.toDto(converted);
      }
    }

    return null;
  }

  /**
   * 更新口播稿（手动编辑保存或 AI 生成写入）
   */
  async updateLivePitch(isbn: string, livePitch: string): Promise<BookLibraryItem> {
    const normalized = normalizeIsbn(isbn);
    if (!normalized) {
      throw new Error(`Invalid ISBN: ${isbn}`);
    }
    const existing = await this.prisma.bookLibraryItem.findUnique({ where: { isbn: normalized } });
    if (!existing) {
      throw new Error(`Book not found: ${isbn}`);
    }
    const updated = await this.prisma.bookLibraryItem.update({
      where: { isbn: normalized },
      data: {
        livePitch: livePitch.trim() || null,
        livePitchGeneratedAt: new Date(),
      },
    });
    return this.toDto(updated);
  }

  /**
   * 更新图书中文翻译字段（缓存 LLM 翻译结果）
   */
  async updateTranslation(isbn: string, translation: BookTranslation): Promise<BookLibraryItem> {
    const normalized = normalizeIsbn(isbn);
    if (!normalized) {
      throw new Error(`Invalid ISBN: ${isbn}`);
    }
    const existing = await this.prisma.bookLibraryItem.findUnique({ where: { isbn: normalized } });
    if (!existing) {
      throw new Error(`Book not found: ${isbn}`);
    }
    const data: Prisma.BookLibraryItemUpdateInput = {};
    if (translation.titleZh !== undefined) data.titleZh = translation.titleZh || null;
    if (translation.authorZh !== undefined) data.authorZh = translation.authorZh || null;
    if (translation.publisherZh !== undefined) data.publisherZh = translation.publisherZh || null;
    if (translation.summaryZh !== undefined) data.summaryZh = translation.summaryZh || null;
    const updated = await this.prisma.bookLibraryItem.update({ where: { isbn: normalized }, data });
    return this.toDto(updated);
  }

  async updateEnrichment(isbn: string, enrichment: BookEnrichment | null): Promise<BookLibraryItem> {
    const normalized = normalizeIsbn(isbn);
    if (!normalized) {
      throw new Error(`Invalid ISBN: ${isbn}`);
    }
    const existing = await this.prisma.bookLibraryItem.findUnique({ where: { isbn: normalized } });
    if (!existing) {
      throw new Error(`Book not found: ${isbn}`);
    }
    const updated = await this.prisma.bookLibraryItem.update({
      where: { isbn: normalized },
      data: {
        enrichment: this.toJson(enrichment),
        enrichmentUpdatedAt: new Date(),
      },
    });
    return this.toDto(updated);
  }

  async upsertMany(
    books: Array<BookMetadata | BookRankMappedBook>,
    defaults: Partial<Pick<BookLibraryItem, 'category' | 'categoryName' | 'rank'>> = {},
  ): Promise<BookLibraryItem[]> {
    const saved: BookLibraryItem[] = [];
    for (const book of books) {
      const item = await this.upsertOne(book, defaults);
      if (item) saved.push(item);
    }
    return saved;
  }

  async importFromBookRank(payload: BookRankImportPayload): Promise<BookRankImportResult> {
    const limit = this.clampInt(payload.limit, 1, 50, 20);
    const items =
      payload.kind === 'new-books'
        ? await this.bookRank.fetchNewBooks(limit)
        : await this.bookRank.fetchBestsellers(payload.category || 'hardcover-fiction', limit);
    const saved = await this.upsertMany(items);
    return { imported: saved.length, items: saved };
  }

  async createPendingSyncItems(isbns: string[], reason = 'metadata_not_found'): Promise<void> {
    const normalized = Array.from(new Set(isbns.map((isbn) => normalizeIsbn(isbn)).filter(Boolean) as string[]));
    for (const isbn of normalized) {
      const existing = await this.prisma.bookLibraryItem.findUnique({ where: { isbn } });
      if (!existing) {
        await this.prisma.bookLibraryItem.create({
          data: {
            isbn,
            title: `待同步图书 (${isbn})`,
            author: '待同步',
            coverUrl: null,
            summary: null,
            publisher: null,
            publishedDate: null,
            pageCount: null,
            source: 'mock',
            metadataSyncStatus: 'pending',
            metadataSyncError: reason,
          },
        });
        continue;
      }

      if (existing.source === 'mock' || existing.metadataSyncStatus !== 'synced') {
        await this.prisma.bookLibraryItem.update({
          where: { isbn },
          data: {
            metadataSyncStatus: 'pending',
            metadataSyncError: reason,
            queryCount: { increment: 1 },
          },
        });
      }
    }
  }

  private async upsertOne(
    book: BookMetadata | BookRankMappedBook,
    defaults: Partial<Pick<BookLibraryItem, 'category' | 'categoryName' | 'rank'>>,
  ): Promise<BookLibraryItem | null> {
    const isbn = normalizeIsbn(book.isbn);
    if (!isbn) return null;
    const existing = await this.prisma.bookLibraryItem.findUnique({ where: { isbn } });
    const category = 'category' in book ? book.category ?? defaults.category ?? null : defaults.category ?? null;
    const categoryName = 'categoryName' in book ? book.categoryName ?? defaults.categoryName ?? null : defaults.categoryName ?? null;
    const rank = 'rank' in book ? book.rank ?? defaults.rank ?? null : defaults.rank ?? null;
    const syncStatus = this.initialSyncStatus(book);

    if (!existing) {
      const created = await this.prisma.bookLibraryItem.create({
        data: {
          isbn,
          title: book.title.trim(),
          author: book.author.trim(),
          coverUrl: book.coverUrl ?? null,
          summary: this.cleanNullable(book.summary),
          publisher: this.cleanNullable(book.publisher),
          publishedDate: this.cleanNullable(book.publishedDate),
          pageCount: book.pageCount ?? null,
          ...('titleZh' in book && book.titleZh !== undefined ? { titleZh: this.cleanNullable(book.titleZh) } : {}),
          ...('authorZh' in book && book.authorZh !== undefined ? { authorZh: this.cleanNullable(book.authorZh) } : {}),
          ...('publisherZh' in book && book.publisherZh !== undefined ? { publisherZh: this.cleanNullable(book.publisherZh) } : {}),
          ...('summaryZh' in book && book.summaryZh !== undefined ? { summaryZh: this.cleanNullable(book.summaryZh) } : {}),
          ...('enrichment' in book && book.enrichment !== undefined ? { enrichment: this.toJson(book.enrichment) } : {}),
          ...('enrichment' in book && book.enrichment ? { enrichmentUpdatedAt: new Date() } : {}),
          source: book.source,
          category,
          categoryName,
          rank,
          metadataSyncStatus: syncStatus,
          metadataSyncedAt: syncStatus === 'synced' ? new Date() : null,
          metadataSyncError: null,
        },
      });
      return this.toDto(created);
    }

    const preserveBookRank = existing.source === 'bookrank' && book.source !== 'bookrank';
    const updated = await this.prisma.bookLibraryItem.update({
      where: { isbn },
      data: {
        ...(preserveBookRank ? {} : this.presentString('title', book.title, existing.title)),
        ...(preserveBookRank ? {} : this.presentString('author', book.author, existing.author)),
        ...this.presentNullableString('coverUrl', book.coverUrl, existing.coverUrl, preserveBookRank),
        ...this.presentNullableString('summary', book.summary, existing.summary, preserveBookRank),
        ...this.presentNullableString('publisher', book.publisher, existing.publisher, preserveBookRank),
        ...this.presentNullableString('publishedDate', book.publishedDate, existing.publishedDate, preserveBookRank),
        ...('titleZh' in book && book.titleZh !== undefined ? { titleZh: this.cleanNullable(book.titleZh) } : {}),
        ...('authorZh' in book && book.authorZh !== undefined ? { authorZh: this.cleanNullable(book.authorZh) } : {}),
        ...('publisherZh' in book && book.publisherZh !== undefined ? { publisherZh: this.cleanNullable(book.publisherZh) } : {}),
        ...('summaryZh' in book && book.summaryZh !== undefined ? { summaryZh: this.cleanNullable(book.summaryZh) } : {}),
        ...('enrichment' in book && book.enrichment !== undefined ? { enrichment: this.toJson(book.enrichment) } : {}),
        ...('enrichment' in book && book.enrichment ? { enrichmentUpdatedAt: new Date() } : {}),
        ...(book.pageCount && !(preserveBookRank && existing.pageCount) ? { pageCount: book.pageCount } : {}),
        source: this.preferSource(existing.source, book.source),
        ...this.syncStatusPatch(book),
        ...(category ? { category } : {}),
        ...(categoryName ? { categoryName } : {}),
        ...(rank ? { rank } : {}),
        queryCount: { increment: 1 },
      },
    });
    return this.toDto(updated);
  }

  private buildWhere(options: LibraryListOptions): Prisma.BookLibraryItemWhereInput {
    const and: Prisma.BookLibraryItemWhereInput[] = [];
    const q = options.q?.trim();
    if (q) {
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { author: { contains: q, mode: 'insensitive' } },
          { isbn: { contains: q } },
          { summary: { contains: q, mode: 'insensitive' } },
          { publisher: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (options.source?.trim()) and.push({ source: options.source.trim() });
    if (options.category?.trim()) and.push({ category: options.category.trim() });
    const syncStatus = this.toSyncStatusFilter(options.syncStatus);
    if (syncStatus === 'incomplete') {
      and.push({ metadataSyncStatus: { in: ['pending', 'syncing', 'partial', 'failed'] } });
    } else if (syncStatus) {
      and.push({ metadataSyncStatus: syncStatus });
    }
    return and.length > 0 ? { AND: and } : {};
  }

  private toDto(item: {
    id: string;
    isbn: string;
    title: string;
    author: string;
    coverUrl: string | null;
    summary: string | null;
    publisher: string | null;
    publishedDate: string | null;
    pageCount: number | null;
    titleZh: string | null;
    authorZh: string | null;
    publisherZh: string | null;
    summaryZh: string | null;
    enrichment?: Prisma.JsonValue | null;
    enrichmentUpdatedAt?: Date | null;
    source: string;
    category: string | null;
    categoryName: string | null;
    rank: number | null;
    queryCount: number;
    metadataSyncStatus?: string | null;
    metadataSyncAttempts?: number | null;
    metadataSyncedAt?: Date | null;
    metadataSyncError?: string | null;
    livePitch?: string | null;
    livePitchGeneratedAt?: Date | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
  }): BookLibraryItem {
    const genericMock = this.isGenericMockItem(item);
    const summary = this.isGenericSummary(item.summary) ? null : item.summary;
    const metadataSyncStatus = this.toSyncStatus(item.metadataSyncStatus, { ...item, summary }, genericMock);
    return {
      id: item.id,
      isbn: item.isbn,
      title: genericMock ? `待同步图书 (${item.isbn})` : item.title,
      author: genericMock ? '待同步' : item.author,
      coverUrl: genericMock || this.isPlaceholderCover(item.coverUrl) ? null : item.coverUrl,
      summary: genericMock ? null : summary,
      publisher: item.publisher,
      publishedDate: item.publishedDate,
      pageCount: item.pageCount,
      titleZh: item.titleZh,
      authorZh: item.authorZh,
      publisherZh: item.publisherZh,
      summaryZh: item.summaryZh,
      enrichment: this.toEnrichment(item.enrichment),
      enrichmentUpdatedAt: item.enrichmentUpdatedAt?.toISOString() ?? null,
      source: this.toBookSource(item.source),
      category: item.category,
      categoryName: item.categoryName,
      rank: item.rank,
      queryCount: item.queryCount,
      metadataSyncStatus,
      metadataSyncAttempts: item.metadataSyncAttempts ?? 0,
      metadataSyncedAt: item.metadataSyncedAt?.toISOString() ?? null,
      metadataSyncError: item.metadataSyncError ?? null,
      livePitch: item.livePitch ?? null,
      livePitchGeneratedAt: item.livePitchGeneratedAt?.toISOString() ?? null,
      firstSeenAt: item.firstSeenAt.toISOString(),
      lastSeenAt: item.lastSeenAt.toISOString(),
    };
  }

  private toBookSource(value: string): BookMetadata['source'] {
    return value === 'openlibrary' || value === 'googlebooks' || value === 'mock' || value === 'bookrank'
      ? value
      : 'mock';
  }

  private toEnrichment(value: Prisma.JsonValue | null | undefined): BookEnrichment | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as unknown as BookEnrichment;
  }

  private toJson(value: BookEnrichment | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    return value ? (value as Prisma.InputJsonValue) : Prisma.JsonNull;
  }

  private toSyncStatusFilter(value: string | null | undefined): BookLibrarySyncStatusFilter | null {
    if (
      value === 'pending' ||
      value === 'syncing' ||
      value === 'synced' ||
      value === 'partial' ||
      value === 'failed' ||
      value === 'incomplete'
    ) {
      return value;
    }
    return null;
  }

  private preferSource(existing: string, incoming: BookMetadata['source']): string {
    if (incoming === 'bookrank') return incoming;
    if (existing === 'mock' && incoming !== 'mock') return incoming;
    return existing;
  }

  private initialSyncStatus(book: BookMetadata | BookRankMappedBook): BookMetadataSyncStatus {
    if (book.source === 'mock') return 'pending';
    return this.hasFullSummary(book.summary) ? 'synced' : 'partial';
  }

  private syncStatusPatch(book: BookMetadata | BookRankMappedBook): Record<string, unknown> {
    const syncStatus = this.initialSyncStatus(book);
    if (syncStatus === 'synced') {
      return {
        metadataSyncStatus: 'synced',
        metadataSyncedAt: new Date(),
        metadataSyncError: null,
      };
    }
    if (syncStatus === 'partial') {
      return {
        metadataSyncStatus: 'partial',
        metadataSyncedAt: new Date(),
        metadataSyncError: 'summary_not_found',
      };
    }
    if (book.source === 'mock') {
      return { metadataSyncStatus: 'pending' };
    }
    return {};
  }

  private toSyncStatus(
    value: string | null | undefined,
    item: { source: string; summary: string | null },
    genericMock: boolean,
  ): BookMetadataSyncStatus {
    if (value === 'pending' || value === 'syncing' || value === 'synced' || value === 'partial' || value === 'failed') {
      return value;
    }
    if (genericMock || item.source === 'mock') return 'pending';
    return this.hasFullSummary(item.summary) ? 'synced' : 'partial';
  }

  private isGenericMockItem(item: { source: string; title: string; summary: string | null }): boolean {
    return (
      item.source === 'mock' &&
      (item.title.startsWith('GoogleBooks 占位') ||
        item.title.startsWith('待同步图书') ||
        this.isGenericSummary(item.summary))
    );
  }

  private isGenericSummary(value: string | null | undefined): boolean {
    return value?.trim() === 'GoogleBooksAdapter 离线 mock 数据。';
  }

  private isPlaceholderCover(value: string | null | undefined): boolean {
    return Boolean(value && /\/\/placehold\.co\//i.test(value));
  }

  private presentString(field: 'title' | 'author', value: string, existing: string): Record<string, string> {
    const clean = value.replace(/\s+/g, ' ').trim();
    return clean && clean !== existing ? { [field]: clean } : {};
  }

  private presentNullableString(
    field: 'coverUrl' | 'summary' | 'publisher' | 'publishedDate',
    value: string | null | undefined,
    existing: string | null,
    preserveExisting = false,
  ): Record<string, string | null> {
    const clean = this.cleanNullable(value);
    if (field === 'summary' && (this.isGenericSummary(value) || (!clean && this.isGenericSummary(existing)))) {
      return { summary: null };
    }
    if (preserveExisting && existing) return {};
    return clean && clean !== existing ? { [field]: clean } : {};
  }

  private cleanNullable(value: string | null | undefined): string | null {
    const text = value?.replace(/\s+/g, ' ').trim();
    return text || null;
  }

  private hasFullSummary(value: string | null | undefined): boolean {
    const text = this.cleanNullable(value);
    return Boolean(text && !this.isGenericSummary(text) && !text.startsWith('Open Library 目录信息显示：'));
  }

  private clampInt(value: unknown, min: number, max: number, fallback: number): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }
}
