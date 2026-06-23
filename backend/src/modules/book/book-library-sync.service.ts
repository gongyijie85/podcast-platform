import { Injectable, Logger } from '@nestjs/common';
import type { BookLibraryItem as PrismaBookLibraryItem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenLibraryAdapter } from './adapters/open-library.adapter';
import { GoogleBooksAdapter } from './adapters/google-books.adapter';
import type { BookLibrarySyncStartResult, BookLibrarySyncStatusResult, BookMetadata } from '@shared/book';

const SYNC_BATCH_LIMIT = 300;
const SYNC_DELAY_MS = 350;

@Injectable()
export class BookLibrarySyncService {
  private readonly logger = new Logger(BookLibrarySyncService.name);
  private running = false;
  private status: BookLibrarySyncStatusResult = this.idleStatus();

  constructor(
    private readonly prisma: PrismaService,
    private readonly openLibrary: OpenLibraryAdapter,
    private readonly googleBooks: GoogleBooksAdapter,
  ) {}

  start(): BookLibrarySyncStartResult {
    if (this.running) {
      return { accepted: false, status: this.status };
    }

    this.running = true;
    this.status = {
      running: true,
      total: 0,
      processed: 0,
      updated: 0,
      partial: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      currentIsbn: null,
      lastError: null,
    };

    void this.run().catch((error) => {
      this.logger.error(`Book library sync crashed: ${(error as Error).message}`, (error as Error).stack);
      this.status = {
        ...this.status,
        running: false,
        finishedAt: new Date().toISOString(),
        lastError: (error as Error).message,
      };
      this.running = false;
    });

    return { accepted: true, status: this.status };
  }

  getStatus(): BookLibrarySyncStatusResult {
    return this.status;
  }

  private async run(): Promise<void> {
    const candidates = await this.findCandidates();
    this.status = { ...this.status, total: candidates.length };

    if (candidates.length === 0) {
      this.status = {
        ...this.status,
        running: false,
        finishedAt: new Date().toISOString(),
        currentIsbn: null,
      };
      this.running = false;
      return;
    }

    await this.prisma.bookLibraryItem.updateMany({
      where: { id: { in: candidates.map((item) => item.id) } },
      data: { metadataSyncStatus: 'syncing', metadataSyncError: null },
    });

    for (const item of candidates) {
      this.status = { ...this.status, currentIsbn: item.isbn };
      await this.syncOne(item);
      await this.delay(SYNC_DELAY_MS);
    }

    this.status = {
      ...this.status,
      running: false,
      finishedAt: new Date().toISOString(),
      currentIsbn: null,
    };
    this.running = false;
  }

  private async findCandidates(): Promise<PrismaBookLibraryItem[]> {
    return this.prisma.bookLibraryItem.findMany({
      where: {
        OR: [
          { metadataSyncStatus: { in: ['pending', 'failed'] } },
          { metadataSyncStatus: 'partial', summary: null },
          { source: 'mock' },
          { summary: null },
          { summary: { startsWith: 'Open Library 目录信息显示：' } },
          { summary: 'GoogleBooksAdapter 离线 mock 数据。' },
          { title: { startsWith: 'GoogleBooks 占位' } },
        ],
      },
      orderBy: [{ lastSeenAt: 'desc' }],
      take: SYNC_BATCH_LIMIT,
    });
  }

  private async syncOne(item: PrismaBookLibraryItem): Promise<void> {
    try {
      const meta = await this.resolveRealMetadata(item.isbn);
      if (!meta) {
        await this.markFailed(item, 'metadata_not_found');
        return;
      }

      const hasFullSummary = this.hasFullSummary(meta);
      const metadataSyncStatus = hasFullSummary ? 'synced' : 'partial';
      const previousSummary = this.isGenericMockItem(item) ? null : item.summary;
      await this.prisma.bookLibraryItem.update({
        where: { id: item.id },
        data: {
          title: this.clean(meta.title) || item.title,
          author: this.clean(meta.author) || item.author,
          coverUrl: this.cleanNullable(meta.coverUrl) ?? item.coverUrl,
          summary: this.cleanNullable(meta.summary) ?? previousSummary,
          publisher: this.cleanNullable(meta.publisher) ?? item.publisher,
          publishedDate: this.cleanNullable(meta.publishedDate) ?? item.publishedDate,
          pageCount: meta.pageCount ?? item.pageCount,
          source: meta.source,
          metadataSyncStatus,
          metadataSyncAttempts: { increment: 1 },
          metadataSyncedAt: new Date(),
          metadataSyncError: hasFullSummary ? null : 'summary_not_found',
          queryCount: { increment: 1 },
        },
      });
      this.status = {
        ...this.status,
        processed: this.status.processed + 1,
        updated: this.status.updated + (hasFullSummary ? 1 : 0),
        partial: (this.status.partial ?? 0) + (hasFullSummary ? 0 : 1),
      };
    } catch (error) {
      await this.markFailed(item, (error as Error).message);
    }
  }

  private async resolveRealMetadata(isbn: string): Promise<BookMetadata | null> {
    let meta = await this.openLibrary.fetchByIsbn(isbn);
    if (meta && !this.hasFullSummary(meta)) {
      const google = await this.googleBooks.fetchByIsbn(isbn);
      if (google && google.source !== 'mock' && !this.isGenericMock(google) && this.hasFullSummary(google)) {
        meta = {
          ...meta,
          coverUrl: meta.coverUrl ?? google.coverUrl ?? null,
          publisher: meta.publisher ?? google.publisher ?? null,
          publishedDate: meta.publishedDate ?? google.publishedDate ?? null,
          pageCount: meta.pageCount ?? google.pageCount ?? null,
          summary: google.summary,
        };
      }
    }
    if (!meta) meta = await this.googleBooks.fetchByIsbn(isbn);
    if (!meta || meta.source === 'mock' || this.isGenericMock(meta)) return null;
    return this.hasUsableIdentity(meta) ? meta : null;
  }

  private async markFailed(item: PrismaBookLibraryItem, reason: string): Promise<void> {
    await this.prisma.bookLibraryItem.update({
      where: { id: item.id },
      data: {
        metadataSyncStatus: 'failed',
        metadataSyncAttempts: { increment: 1 },
        metadataSyncError: reason.slice(0, 500),
      },
    });
    this.status = {
      ...this.status,
      processed: this.status.processed + 1,
      failed: this.status.failed + 1,
      lastError: reason,
    };
  }

  private hasUsableSummary(meta: BookMetadata): boolean {
    return Boolean(meta.summary?.replace(/\s+/g, ' ').trim());
  }

  private hasFullSummary(meta: BookMetadata): boolean {
    return this.hasUsableSummary(meta) && !this.isCatalogDerivedSummary(meta.summary);
  }

  private hasUsableIdentity(meta: BookMetadata): boolean {
    const title = this.clean(meta.title);
    const author = this.clean(meta.author);
    if (!title || title.startsWith('Untitled') || title.startsWith('GoogleBooks 占位')) return false;
    if (author && author !== 'Unknown' && author !== '待同步') return true;
    return Boolean(meta.coverUrl || meta.publisher || meta.publishedDate || meta.pageCount);
  }

  private isGenericMock(meta: BookMetadata): boolean {
    return (
      meta.title.startsWith('GoogleBooks 占位') ||
      meta.summary?.trim() === 'GoogleBooksAdapter 离线 mock 数据。'
    );
  }

  private isGenericMockItem(item: PrismaBookLibraryItem): boolean {
    return (
      item.source === 'mock' &&
      (item.title.startsWith('GoogleBooks 占位') ||
        item.title.startsWith('待同步图书') ||
        item.summary?.trim() === 'GoogleBooksAdapter 离线 mock 数据。')
    );
  }

  private isCatalogDerivedSummary(summary: string | null | undefined): boolean {
    return this.clean(summary).startsWith('Open Library 目录信息显示：');
  }

  private clean(value: string | null | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
  }

  private cleanNullable(value: string | null | undefined): string | null {
    return this.clean(value) || null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private idleStatus(): BookLibrarySyncStatusResult {
    return {
      running: false,
      total: 0,
      processed: 0,
      updated: 0,
      partial: 0,
      failed: 0,
      startedAt: null,
      finishedAt: null,
      currentIsbn: null,
      lastError: null,
    };
  }
}
