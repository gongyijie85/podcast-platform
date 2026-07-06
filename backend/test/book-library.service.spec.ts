import { BookLibraryService } from '../src/modules/book/book-library.service';
import type { BookMetadata } from '@shared/book';

const now = new Date('2026-06-18T00:00:00.000Z');

describe('BookLibraryService', () => {
  const rows = new Map<string, Record<string, unknown>>();
  const prisma = {
    bookLibraryItem: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const bookRank = {
    fetchBestsellers: jest.fn(),
    fetchNewBooks: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    rows.clear();
    prisma.bookLibraryItem.findUnique.mockImplementation(({ where }: { where: { isbn: string } }) => rows.get(where.isbn) ?? null);
    prisma.bookLibraryItem.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      const row = {
        id: `lib-${data.isbn}`,
        firstSeenAt: now,
        lastSeenAt: now,
        queryCount: 1,
        ...data,
      };
      rows.set(data.isbn, row);
      return row;
    });
    prisma.bookLibraryItem.update.mockImplementation(({ where, data }: { where: { isbn: string }; data: Record<string, unknown> }) => {
      const existing = rows.get(where.isbn);
      const row = {
        ...existing,
        ...data,
        queryCount: existing.queryCount + (data.queryCount?.increment ?? 0),
        lastSeenAt: now,
      };
      rows.set(where.isbn, row);
      return row;
    });
    prisma.$transaction.mockImplementation(async (calls: Array<Promise<unknown>>) => Promise.all(calls));
  });

  function service(): BookLibraryService {
    return new BookLibraryService(prisma as never, bookRank as never);
  }

  it('upserts books by ISBN, increments query count, and does not overwrite summaries with null', async () => {
    const book: BookMetadata = {
      isbn: '978-0241662151',
      title: 'The Creative Act: A Way of Being',
      author: 'Rick Rubin',
      summary: 'A real summary.',
      source: 'googlebooks',
    };

    const created = await service().upsertMany([book]);
    const updated = await service().upsertMany([{ ...book, summary: null, source: 'mock' }]);

    expect(created[0]).toMatchObject({
      isbn: '9780241662151',
      summary: 'A real summary.',
      source: 'googlebooks',
      queryCount: 1,
    });
    expect(updated[0]).toMatchObject({
      isbn: '9780241662151',
      summary: 'A real summary.',
      source: 'googlebooks',
      queryCount: 2,
    });
  });

  it('imports BookRank bestsellers and stores imported items', async () => {
    bookRank.fetchBestsellers.mockResolvedValueOnce([
      {
        isbn: '9780063511637',
        title: 'WHISTLER',
        author: 'Ann Patchett',
        summary: '中文长简介。',
        source: 'bookrank',
        category: 'hardcover-fiction',
        categoryName: '精装小说',
        rank: 1,
      },
    ]);

    const result = await service().importFromBookRank({
      kind: 'bestsellers',
      category: 'hardcover-fiction',
      limit: 20,
    });

    expect(bookRank.fetchBestsellers).toHaveBeenCalledWith('hardcover-fiction', 20);
    expect(result.imported).toBe(1);
    expect(result.items[0]).toMatchObject({
      source: 'bookrank',
      category: 'hardcover-fiction',
      categoryName: '精装小说',
      rank: 1,
    });
  });

  it('creates clean pending sync records for unresolved ISBNs', async () => {
    await service().createPendingSyncItems(['9781785989117']);

    const item = rows.get('9781785989117');

    expect(item).toMatchObject({
      isbn: '9781785989117',
      title: '待同步图书 (9781785989117)',
      author: '待同步',
      summary: null,
      source: 'mock',
      metadataSyncStatus: 'pending',
      metadataSyncError: 'metadata_not_found',
    });
    expect(item.summary).not.toBe('GoogleBooksAdapter 离线 mock 数据。');
  });

  it('filters library items by sync status and hides generic mock covers', async () => {
    prisma.bookLibraryItem.findMany.mockResolvedValueOnce([
      {
        id: 'lib-failed',
        isbn: '2191000101991',
        title: '待同步图书 (2191000101991)',
        author: '待同步',
        coverUrl: 'https://placehold.co/200x200?text=GB+1991',
        summary: null,
        publisher: null,
        publishedDate: null,
        pageCount: null,
        source: 'mock',
        category: null,
        categoryName: null,
        rank: null,
        queryCount: 3,
        metadataSyncStatus: 'failed',
        metadataSyncAttempts: 3,
        metadataSyncedAt: null,
        metadataSyncError: 'metadata_not_found',
        firstSeenAt: now,
        lastSeenAt: now,
      },
      {
        id: 'lib-partial',
        isbn: '9780593233528',
        title: 'Sibley Backyard Birding Puzzle',
        author: 'David Sibley',
        coverUrl: 'https://placehold.co/200x200?text=GB+3528',
        summary: 'Open Library 目录信息显示：Sibley Backyard Birding Puzzle。',
        publisher: 'Potter',
        publishedDate: '2020',
        pageCount: null,
        source: 'openlibrary',
        category: null,
        categoryName: null,
        rank: null,
        queryCount: 4,
        metadataSyncStatus: 'partial',
        metadataSyncAttempts: 5,
        metadataSyncedAt: now,
        metadataSyncError: 'summary_not_found',
        firstSeenAt: now,
        lastSeenAt: now,
      },
    ]);
    prisma.bookLibraryItem.count.mockResolvedValueOnce(2);

    const result = await service().list({ syncStatus: 'incomplete' });

    expect(prisma.bookLibraryItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          { metadataSyncStatus: { in: ['pending', 'syncing', 'partial', 'failed'] } },
        ],
      },
    }));
    expect(result.items[0]).toMatchObject({
      title: '待同步图书 (2191000101991)',
      coverUrl: null,
      metadataSyncStatus: 'failed',
    });
    expect(result.items[1]).toMatchObject({
      title: 'Sibley Backyard Birding Puzzle',
      coverUrl: null,
      metadataSyncStatus: 'partial',
    });
  });

  it('strips legacy mock summaries from real source records', async () => {
    prisma.bookLibraryItem.findMany.mockResolvedValueOnce([
      {
        id: 'lib-title-only',
        isbn: '9780385547475',
        title: 'Power Play',
        author: 'Unknown',
        coverUrl: null,
        summary: 'GoogleBooksAdapter 离线 mock 数据。',
        publisher: null,
        publishedDate: null,
        pageCount: null,
        source: 'openlibrary',
        category: null,
        categoryName: null,
        rank: null,
        queryCount: 2,
        metadataSyncStatus: 'partial',
        metadataSyncAttempts: 6,
        metadataSyncedAt: now,
        metadataSyncError: 'summary_not_found',
        firstSeenAt: now,
        lastSeenAt: now,
      },
    ]);
    prisma.bookLibraryItem.count.mockResolvedValueOnce(1);

    const result = await service().list({ q: 'Power Play' });

    expect(result.items[0]).toMatchObject({
      title: 'Power Play',
      source: 'openlibrary',
      summary: null,
      metadataSyncStatus: 'partial',
    });
  });

  it('does not overwrite an existing BookRank summary with other metadata sources', async () => {
    await service().upsertMany([
      {
        isbn: '9780063511637',
        title: 'WHISTLER',
        author: 'Ann Patchett',
        summary: 'BookRank 中文简介。',
        publisher: 'Harper',
        publishedDate: '2026-06-02',
        source: 'bookrank',
        category: 'hardcover-fiction',
        categoryName: '精装小说',
        rank: 1,
      },
    ]);

    const updated = await service().upsertMany([
      {
        isbn: '9780063511637',
        title: 'Whistler',
        author: 'Ann Patchett',
        summary: 'Google Books English summary.',
        publisher: 'Harper',
        publishedDate: '2026-06-02',
        pageCount: 320,
        source: 'googlebooks',
      },
    ]);

    expect(updated[0]).toMatchObject({
      title: 'WHISTLER',
      summary: 'BookRank 中文简介。',
      source: 'bookrank',
      pageCount: 320,
      queryCount: 2,
    });
  });

  it('findByIsbn returns single book detail with livePitch field', async () => {
    prisma.bookLibraryItem.findUnique.mockResolvedValueOnce({
      id: 'lib-1',
      isbn: '9787544291170',
      title: '解忧杂货店',
      author: '东野圭吾',
      coverUrl: 'https://example.com/cover.jpg',
      summary: '中文简介',
      publisher: '南海出版公司',
      publishedDate: '2014-05',
      pageCount: 291,
      source: 'googlebooks',
      category: null,
      categoryName: null,
      rank: null,
      queryCount: 5,
      metadataSyncStatus: 'synced',
      metadataSyncAttempts: 1,
      metadataSyncedAt: now,
      metadataSyncError: null,
      livePitch: '已有的口播稿',
      livePitchGeneratedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
    });

    const result = await service().findByIsbn('9787544291170');

    expect(result).toMatchObject({
      isbn: '9787544291170',
      title: '解忧杂货店',
      livePitch: '已有的口播稿',
      livePitchGeneratedAt: now.toISOString(),
    });
  });

  it('findByIsbn returns null for invalid ISBN', async () => {
    const result = await service().findByIsbn('invalid-isbn');
    expect(result).toBeNull();
  });

  it('updateLivePitch updates livePitch and livePitchGeneratedAt', async () => {
    await service().upsertMany([
      {
        isbn: '9787544291170',
        title: '解忧杂货店',
        author: '东野圭吾',
        summary: '中文简介',
        source: 'googlebooks',
      },
    ]);

    const updated = await service().updateLivePitch('9787544291170', '新的口播稿内容');

    expect(updated).toMatchObject({
      isbn: '9787544291170',
      livePitch: '新的口播稿内容',
    });
    expect(updated.livePitchGeneratedAt).toBeTruthy();
  });

  it('updateLivePitch throws when book not found', async () => {
    await expect(service().updateLivePitch('9780000000002', '口播稿')).rejects.toThrow(/Book not found/);
  });
});
