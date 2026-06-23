import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BookService } from '../src/modules/book/book.service';
import { ResolveMetadataDto } from '../src/modules/book/dto/fetch-metadata.dto';
import type { BookMetadata } from '@shared/book';

const makeValidIsbn13 = (index: number): string => {
  const body = `978000000${String(index).padStart(3, '0')}`;
  const sum = body
    .split('')
    .reduce((acc, digit, i) => acc + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
};

describe('BookService metadata resolution', () => {
  const openLibrary = {
    fetchByIsbn: jest.fn(),
  };
  const googleBooks = {
    fetchByIsbn: jest.fn(),
  };
  const library = {
    findByIsbns: jest.fn(),
    upsertMany: jest.fn(),
    createPendingSyncItems: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    library.findByIsbns.mockResolvedValue([]);
    library.upsertMany.mockResolvedValue([]);
    library.createPendingSyncItems.mockResolvedValue(undefined);
  });

  it('keeps input order, falls back to Google Books, and adds podcast angles', async () => {
    openLibrary.fetchByIsbn
      .mockResolvedValueOnce({
        isbn: '9787121362200',
        title: '人类简史',
        author: '尤瓦尔·赫拉利',
        summary: '从认知革命到科学革命的宏观回顾。',
        source: 'openlibrary',
      } satisfies BookMetadata)
      .mockResolvedValueOnce(null);
    googleBooks.fetchByIsbn.mockResolvedValueOnce({
      isbn: '9787508672069',
      title: '思考，快与慢',
      author: '丹尼尔·卡尼曼',
      summary: '介绍人类两种思维模式。',
      source: 'googlebooks',
    } satisfies BookMetadata);

    const service = new BookService(openLibrary as never, googleBooks as never);
    const result = await service.fetchBatch(['9787121362200', '9787508672069']);

    expect(result.failed).toEqual([]);
    expect(result.ok.map((b) => b.isbn)).toEqual(['9787121362200', '9787508672069']);
    expect(result.ok.map((b) => b.source)).toEqual(['openlibrary', 'googlebooks']);
    expect(result.ok[0]?.podcastAngle).toContain('适合从"人类简史"');
    expect(result.ok[1]?.podcastAngle).toContain('丹尼尔·卡尼曼');
  });

  it('records invalid and unresolved ISBNs as failures', async () => {
    openLibrary.fetchByIsbn.mockResolvedValueOnce(null);
    googleBooks.fetchByIsbn.mockResolvedValueOnce(null);

    const service = new BookService(openLibrary as never, googleBooks as never);
    const result = await service.fetchBatch(['bad-isbn', '9787121362200']);

    expect(result.ok).toEqual([]);
    expect(result.failed).toEqual(['bad-isbn', '9787121362200']);
  });

  it('creates pending library sync items for unresolved valid ISBNs', async () => {
    openLibrary.fetchByIsbn.mockResolvedValueOnce(null);
    googleBooks.fetchByIsbn.mockResolvedValueOnce(null);

    const service = new BookService(openLibrary as never, googleBooks as never, library as never);
    const result = await service.fetchBatch(['9787121362200']);

    expect(result.failed).toEqual(['9787121362200']);
    expect(library.createPendingSyncItems).toHaveBeenCalledWith(['9787121362200']);
  });

  it('treats generic mock placeholders as unresolved metadata', async () => {
    openLibrary.fetchByIsbn.mockResolvedValueOnce(null);
    googleBooks.fetchByIsbn.mockResolvedValueOnce({
      isbn: '9780000000002',
      title: 'GoogleBooks 占位 (9780000000002)',
      author: 'Mock Author',
      summary: 'GoogleBooksAdapter 离线 mock 数据。',
      source: 'mock',
    } satisfies BookMetadata);

    const service = new BookService(openLibrary as never, googleBooks as never);
    const result = await service.fetchBatch(['9780000000002']);

    expect(result.ok).toEqual([]);
    expect(result.failed).toEqual(['9780000000002']);
  });

  it('resolves 20-book batches with bounded concurrency while preserving input order', async () => {
    const isbns = Array.from({ length: 20 }, (_, i) => makeValidIsbn13(i));
    let inFlight = 0;
    let maxInFlight = 0;
    openLibrary.fetchByIsbn.mockImplementation(async (isbn: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return {
        isbn,
        title: `测试书 ${isbn.slice(-2)}`,
        author: '作者',
        summary: '这是一段真实图书简介，用于验证批量解析时无需额外兜底。',
        source: 'openlibrary',
      } satisfies BookMetadata;
    });

    const service = new BookService(openLibrary as never, googleBooks as never);
    const result = await service.fetchBatch(isbns);

    expect(result.failed).toEqual([]);
    expect(result.ok.map((book) => book.isbn)).toEqual(isbns);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(googleBooks.fetchByIsbn).not.toHaveBeenCalled();
  });

  it('fills missing Open Library summaries from real Google Books descriptions only', async () => {
    openLibrary.fetchByIsbn
      .mockResolvedValueOnce({
        isbn: '9780000000002',
        title: '没有简介的书',
        author: '作者甲',
        summary: null,
        source: 'openlibrary',
      } satisfies BookMetadata)
      .mockResolvedValueOnce({
        isbn: '9780000000019',
        title: '不能用占位简介的书',
        author: '作者乙',
        summary: null,
        source: 'openlibrary',
      } satisfies BookMetadata);
    googleBooks.fetchByIsbn
      .mockResolvedValueOnce({
        isbn: '9780000000002',
        title: '没有简介的书',
        author: '作者甲',
        summary: '这是一段来自 Google Books 的真实图书简介。',
        source: 'googlebooks',
      } satisfies BookMetadata)
      .mockResolvedValueOnce({
        isbn: '9780000000019',
        title: 'GoogleBooks 占位 (9780000000019)',
        author: 'Mock Author',
        summary: 'GoogleBooksAdapter 离线 mock 数据。',
        source: 'mock',
      } satisfies BookMetadata);

    const service = new BookService(openLibrary as never, googleBooks as never);
    const result = await service.fetchBatch(['9780000000002', '9780000000019']);

    expect(result.ok[0]?.summary).toBe('这是一段来自 Google Books 的真实图书简介。');
    expect(result.ok[1]?.summary).toBeNull();
  });

  it('uses cached library metadata with real summaries before external adapters', async () => {
    library.findByIsbns.mockResolvedValueOnce([
      {
        id: 'lib-1',
        isbn: '9780063511637',
        title: 'WHISTLER',
        author: 'Ann Patchett',
        coverUrl: null,
        summary: 'BookRank 提供的真实中文简介。',
        publisher: 'Harper',
        publishedDate: '2026-06-02',
        pageCount: null,
        source: 'bookrank',
        category: 'hardcover-fiction',
        categoryName: '精装小说',
        rank: 1,
        queryCount: 1,
        firstSeenAt: '2026-06-18T00:00:00.000Z',
        lastSeenAt: '2026-06-18T00:00:00.000Z',
      },
    ]);

    const service = new BookService(openLibrary as never, googleBooks as never, library as never);
    const result = await service.fetchBatch(['9780063511637']);

    expect(openLibrary.fetchByIsbn).not.toHaveBeenCalled();
    expect(googleBooks.fetchByIsbn).not.toHaveBeenCalled();
    expect(result.ok[0]).toEqual(expect.objectContaining({
      title: 'WHISTLER',
      summary: 'BookRank 提供的真实中文简介。',
      source: 'bookrank',
      podcastAngle: expect.stringContaining('WHISTLER'),
    }));
    expect(library.upsertMany).toHaveBeenCalledWith([expect.objectContaining({ isbn: '9780063511637' })]);
  });

  it('enforces the 20 ISBN resolve payload limit', async () => {
    const dto = plainToInstance(ResolveMetadataDto, {
      isbns: Array.from({ length: 21 }, (_, i) => `97871213622${String(i).padStart(2, '0')}`),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'isbns')).toBe(true);
  });
});
