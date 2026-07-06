/**
 * GoogleBooksAdapter.searchByTitle 单元测试
 * - 用真实 axios.create()，再 spy 替换实例的 get 方法
 * - 避开 axios-retry 在 mock 环境下的兼容问题
 */
import { GoogleBooksAdapter } from '../src/modules/book/adapters/google-books.adapter';

describe('GoogleBooksAdapter.searchByTitle', () => {
  const config = { get: jest.fn() };
  let adapter: GoogleBooksAdapter;
  let getMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string) => {
      if (key === 'thirdParty.googleBooks.base') return 'https://www.googleapis.com/books/v1';
      if (key === 'thirdParty.googleBooks.apiKey') return undefined;
      if (key === 'thirdParty.bookMetadata.allowMock') return false;
      return undefined;
    });
    adapter = new GoogleBooksAdapter(config as never);
    getMock = jest.fn();
    // http 是 private，用 as any 替换 get 方法
    (adapter as unknown as { http: { get: jest.Mock } }).http.get = getMock;
  });

  it('returns empty array when title is empty', async () => {
    const result = await adapter.searchByTitle('   ');
    expect(result).toEqual([]);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('returns empty array when googleBooks base not configured', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'thirdParty.googleBooks.base') return '';
      return undefined;
    });
    const localAdapter = new GoogleBooksAdapter(config as never);
    const result = await localAdapter.searchByTitle('Some Title');
    expect(result).toEqual([]);
  });

  it('maps volumes with ISBN to BookMetadata', async () => {
    getMock.mockResolvedValue({
      data: {
        items: [
          {
            id: 'v1',
            volumeInfo: {
              title: 'The Pragmatic Programmer',
              authors: ['Andrew Hunt', 'David Thomas'],
              imageLinks: { thumbnail: 'http://books.google.com/cover.jpg' },
              description: 'A book about pragmatic programming.',
              publisher: 'Addison-Wesley',
              publishedDate: '2019',
              pageCount: 352,
              industryIdentifiers: [
                { type: 'ISBN_13', identifier: '9780135957059' },
                { type: 'ISBN_10', identifier: '0135957052' },
              ],
            },
          },
          {
            id: 'v2',
            volumeInfo: {
              title: 'No ISBN Book',
              authors: ['Someone'],
              industryIdentifiers: [],
            },
          },
        ],
      },
    });

    const result = await adapter.searchByTitle('Pragmatic Programmer', 'Andrew Hunt');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      isbn: '9780135957059',
      title: 'The Pragmatic Programmer',
      author: 'Andrew Hunt, David Thomas',
      publisher: 'Addison-Wesley',
      pageCount: 352,
      source: 'googlebooks',
    });
    expect(result[0].coverUrl).toMatch(/^https:\/\//);
  });

  it('limits to 5 results', async () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      id: `v${i}`,
      volumeInfo: {
        title: `Book ${i}`,
        authors: ['Author'],
        industryIdentifiers: [{ type: 'ISBN_13', identifier: `978000000000${i}` }],
      },
    }));
    getMock.mockResolvedValue({ data: { items } });

    const result = await adapter.searchByTitle('Book');
    expect(result).toHaveLength(5);
  });

  it('returns empty array when API throws', async () => {
    getMock.mockRejectedValue(new Error('network error'));
    const result = await adapter.searchByTitle('Some Title');
    expect(result).toEqual([]);
  });

  it('returns empty array when no items', async () => {
    getMock.mockResolvedValue({ data: {} });
    const result = await adapter.searchByTitle('Some Title');
    expect(result).toEqual([]);
  });
});
