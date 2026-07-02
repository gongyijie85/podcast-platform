import { Injectable, Logger } from '@nestjs/common';
import { OpenLibraryAdapter } from './adapters/open-library.adapter';
import { GoogleBooksAdapter } from './adapters/google-books.adapter';
import { BookLibraryService } from './book-library.service';
import { normalizeIsbn } from '../../common/utils/isbn';
import type { BookMetadata } from '@shared/book';

@Injectable()
export class BookService {
  private readonly logger = new Logger(BookService.name);
  private readonly batchConcurrency = 4;

  constructor(
    private readonly openLibrary: OpenLibraryAdapter,
    private readonly googleBooks: GoogleBooksAdapter,
    private readonly library?: BookLibraryService,
  ) {}

  /**
   * Try Google Books first for richer descriptions/covers, then fall back to
   * Open Library. `onProgress(done, total)` is called after each ISBN completes.
   */
  async fetchBatch(
    isbns: string[],
    onProgress?: (done: number, total: number) => Promise<void> | void,
  ): Promise<{ ok: BookMetadata[]; failed: string[] }> {
    const normalized = isbns.map((input) => ({
      input,
      isbn: normalizeIsbn(input),
    }));
    const total = normalized.length;
    const cachedByIsbn = await this.loadCachedMetadata(normalized.flatMap((item) => (item.isbn ? [item.isbn] : [])));
    let completed = 0;

    const results = await this.mapWithConcurrency(normalized, this.batchConcurrency, async ({ input, isbn }, index) => {
      const reportProgress = async (): Promise<void> => {
        completed += 1;
        if (onProgress) await onProgress(completed, total);
      };

      if (!isbn) {
        await reportProgress();
        return { index, failed: input };
      }

      const cached = cachedByIsbn.get(isbn);
      if (cached && this.shouldUseCachedCompleteMetadata(cached)) {
        await reportProgress();
        return { index, meta: this.withPodcastAngle(cached) };
      }

      const meta = await this.resolveFreshMetadata(isbn, cached);

      await reportProgress();

      if (meta && this.isGenericMockMetadata(meta)) {
        return { index, failed: isbn };
      }
      if (meta) return { index, meta: this.withPodcastAngle(meta) };
      return { index, failed: isbn };
    });

    results.sort((a, b) => a.index - b.index);
    const ok = results.flatMap((result) => (result.meta ? [result.meta] : []));
    if (ok.length > 0 && this.library) {
      await this.library.upsertMany(ok).catch((e) => {
        this.logger.warn(`Failed to upsert book library metadata: ${(e as Error).message}`);
      });
    }

    const failed = results.flatMap((result) => (result.failed ? [result.failed] : []));
    if (failed.length > 0 && this.library) {
      await this.library.createPendingSyncItems(failed).catch((e) => {
        this.logger.warn(`Failed to create pending book library metadata: ${(e as Error).message}`);
      });
    }

    return {
      ok,
      failed,
    };
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(1, concurrency), items.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
          const current = nextIndex;
          nextIndex += 1;
          results[current] = await worker(items[current], current);
        }
      }),
    );

    return results;
  }

  private async resolveFreshMetadata(isbn: string, cached?: BookMetadata): Promise<BookMetadata | null> {
    const google = await this.googleBooks.fetchByIsbn(isbn);
    if (google && !this.isGenericMockMetadata(google)) {
      if (this.hasFullSummary(google)) return google;

      const open = await this.openLibrary.fetchByIsbn(isbn);
      if (open && !this.isGenericMockMetadata(open) && this.hasFullSummary(open)) {
        return this.mergePreferPrimary(google, open);
      }
      if (cached && this.hasFullSummary(cached)) {
        return this.mergePreferPrimary(google, cached);
      }

      return google;
    }

    const open = await this.openLibrary.fetchByIsbn(isbn);
    if (open && !this.isGenericMockMetadata(open)) return open;
    if (cached && this.shouldUseCachedPartialMetadata(cached)) return cached;
    return null;
  }

  private mergePreferPrimary(primary: BookMetadata, fallback: BookMetadata): BookMetadata {
    return {
      ...primary,
      coverUrl: primary.coverUrl ?? fallback.coverUrl ?? null,
      publisher: primary.publisher ?? fallback.publisher ?? null,
      publishedDate: primary.publishedDate ?? fallback.publishedDate ?? null,
      pageCount: primary.pageCount ?? fallback.pageCount ?? null,
      summary: this.hasFullSummary(primary) ? primary.summary : fallback.summary ?? primary.summary ?? null,
    };
  }

  private hasFullSummary(meta: BookMetadata): boolean {
    const summary = meta.summary?.replace(/\s+/g, ' ').trim();
    return Boolean(
      summary &&
        summary !== 'GoogleBooksAdapter 离线 mock 数据。' &&
        !summary.startsWith('Open Library 目录信息显示：'),
    );
  }

  private async loadCachedMetadata(isbns: string[]): Promise<Map<string, BookMetadata>> {
    if (!this.library || isbns.length === 0) return new Map();
    try {
      const cached = await this.library.findByIsbns(isbns);
      return new Map(
        cached
          .filter((book) => this.shouldUseCachedMetadata(book))
          .map((book) => [book.isbn, book]),
      );
    } catch (e) {
      this.logger.warn(`Failed to read book library cache: ${(e as Error).message}`);
      return new Map();
    }
  }

  private shouldUseCachedMetadata(meta: BookMetadata): boolean {
    if (this.isGenericMockMetadata(meta)) return false;
    return Boolean(meta.title?.trim() && meta.author?.trim());
  }

  private shouldUseCachedCompleteMetadata(meta: BookMetadata): boolean {
    if (!this.shouldUseCachedMetadata(meta)) return false;
    return (meta.source === 'bookrank' || meta.source === 'googlebooks') && this.hasFullSummary(meta);
  }

  private shouldUseCachedPartialMetadata(meta: BookMetadata): boolean {
    return this.shouldUseCachedMetadata(meta);
  }

  private isGenericMockMetadata(meta: BookMetadata): boolean {
    return (
      meta.source === 'mock' ||
      meta.title.startsWith('GoogleBooks 占位') ||
      meta.summary?.trim() === 'GoogleBooksAdapter 离线 mock 数据。'
    );
  }

  private withPodcastAngle(meta: BookMetadata): BookMetadata {
    if (meta.podcastAngle) return meta;
    return {
      ...meta,
      podcastAngle: this.buildPodcastAngle(meta),
    };
  }

  private buildPodcastAngle(meta: BookMetadata): string {
    const summary = (meta.summary ?? '').replace(/\s+/g, ' ').trim();
    const trimmedSummary = summary.length > 80 ? `${summary.slice(0, 80)}...` : summary;
    const focus = meta.author && meta.author !== 'Unknown' ? `${meta.author}的创作视角` : '它背后的核心观点';

    if (trimmedSummary) {
      return `适合从"${meta.title}"的核心问题切入，围绕${focus}展开对谈：${trimmedSummary}`;
    }

    return `适合围绕"${meta.title}"设置一期导读节目，讨论它的关键主题、读者收获和现实启发。`;
  }
}
