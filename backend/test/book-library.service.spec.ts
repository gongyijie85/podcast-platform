import { BookLibraryService } from '../src/modules/book/book-library.service';
import type { BookMetadata } from '@shared/book';

const now = new Date('2026-06-18T00:00:00.000Z');

describe('BookLibraryService', () => {
  const rows = new Map<string, any>();
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
    prisma.bookLibraryItem.create.mockImplementation(({ data }: { data: any }) => {
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
    prisma.bookLibraryItem.update.mockImplementation(({ where, data }: { where: { isbn: string }; data: any }) => {
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
});
