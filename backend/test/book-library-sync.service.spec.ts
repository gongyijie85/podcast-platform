import { BookLibrarySyncService } from '../src/modules/book/book-library-sync.service';
import type { BookMetadata } from '@shared/book';

const waitUntil = async (condition: () => boolean, timeoutMs = 1500): Promise<void> => {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

describe('BookLibrarySyncService', () => {
  it('refreshes pending mock library items and marks them as synced', async () => {
    const row = {
      id: 'lib-1',
      isbn: '9780743273565',
      title: 'GoogleBooks 占位 (9780743273565)',
      author: 'Mock Author',
      coverUrl: null,
      summary: 'GoogleBooksAdapter 离线 mock 数据。',
      publisher: null,
      publishedDate: null,
      pageCount: null,
      source: 'mock',
      category: null,
      categoryName: null,
      rank: null,
      queryCount: 1,
      metadataSyncStatus: 'pending',
      metadataSyncAttempts: 0,
      metadataSyncedAt: null,
      metadataSyncError: null,
      firstSeenAt: new Date('2026-06-22T00:00:00.000Z'),
      lastSeenAt: new Date('2026-06-22T00:00:00.000Z'),
    };
    const prisma = {
      bookLibraryItem: {
        findMany: jest.fn().mockResolvedValue([row]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const openLibrary = { fetchByIsbn: jest.fn().mockResolvedValue(null) };
    const googleBooks = {
      fetchByIsbn: jest.fn().mockResolvedValue({
        isbn: '9780743273565',
        title: 'The Great Gatsby',
        author: 'F. Scott Fitzgerald',
        coverUrl: null,
        summary: 'A real summary about wealth, illusion, and longing.',
        publisher: 'Scribner',
        publishedDate: '2004',
        pageCount: 180,
        source: 'googlebooks',
      } satisfies BookMetadata),
    };

    const service = new BookLibrarySyncService(prisma as never, openLibrary as never, googleBooks as never);
    const start = service.start();

    expect(start.accepted).toBe(true);
    await waitUntil(() => !service.getStatus().running);

    expect(prisma.bookLibraryItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'lib-1' },
      data: expect.objectContaining({
        title: 'The Great Gatsby',
        source: 'googlebooks',
        metadataSyncStatus: 'synced',
        metadataSyncError: null,
      }),
    }));
    expect(service.getStatus()).toMatchObject({ running: false, total: 1, processed: 1, updated: 1, failed: 0 });
  });
});
