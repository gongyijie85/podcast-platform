import { OpenLibraryAdapter } from '../src/modules/book/adapters/open-library.adapter';
import { GoogleBooksAdapter } from '../src/modules/book/adapters/google-books.adapter';
import { BookRankAdapter } from '../src/modules/book/adapters/bookrank.adapter';
import { ConfigService } from '@nestjs/config';

const cfg = (): ConfigService =>
  ({
    get: (k: string) => {
      const map: Record<string, string> = {
        'thirdParty.openLibrary.base': 'https://openlibrary.invalid',
        'thirdParty.googleBooks.base': 'https://googleapis.invalid',
        'thirdParty.googleBooks.apiKey': 'test-google-key',
        'thirdParty.bookRank.base': 'https://bookrank.example',
      };
      return map[k];
    },
  }) as unknown as ConfigService;

describe('Book adapters (mock fallback)', () => {
  it('OpenLibraryAdapter falls back to mock when network fails', async () => {
    const a = new OpenLibraryAdapter(cfg());
    const r = await a.fetchByIsbn('9787121362200');
    expect(r).not.toBeNull();
    expect(r!.title).toContain('人类简史');
    expect(r!.source).toBe('mock');
  });

  it('OpenLibraryAdapter returns null for unknown offline ISBNs so Google can be tried', async () => {
    const a = new OpenLibraryAdapter(cfg());
    const r = await a.fetchByIsbn('9780241662151');
    expect(r).toBeNull();
  });

  it('OpenLibraryAdapter keeps only real descriptions for summaries', () => {
    const a = new OpenLibraryAdapter(cfg());
    const pickRealDescription = (
      a as unknown as { pickRealDescription: (value: unknown) => string | null }
    ).pickRealDescription.bind(a);

    expect(pickRealDescription('USA/CAN')).toBeNull();
    expect(pickRealDescription('180 p. ; 21 cm.1010L Lexile')).toBeNull();
    expect(
      pickRealDescription({
        value:
          'A gripping coming-of-age story about moral courage, family, and racial injustice in a small Southern town.',
      }),
    ).toContain('moral courage');
  });

  it('GoogleBooksAdapter returns mock when network fails', async () => {
    const a = new GoogleBooksAdapter(cfg());
    const r = await a.fetchByIsbn('9999999999999');
    expect(r).not.toBeNull();
    expect(r!.source).toBe('mock');
  });

  it('GoogleBooksAdapter has a curated fallback for 9780241662151', async () => {
    const a = new GoogleBooksAdapter(cfg());
    const r = await a.fetchByIsbn('9780241662151');
    expect(r).not.toBeNull();
    expect(r!.title).toBe('The Creative Act: A Way of Being');
    expect(r!.author).toBe('Rick Rubin');
    expect(r!.source).toBe('mock');
  });

  it('GoogleBooksAdapter sends the configured API key and maps descriptions to summaries', async () => {
    const a = new GoogleBooksAdapter(cfg());
    const get = jest.fn().mockResolvedValue({
      data: {
        items: [
          {
            volumeInfo: {
              title: 'The Great Gatsby',
              authors: ['F. Scott Fitzgerald'],
              description: 'A mysterious American millionaire tries to recapture the sweetheart of his youth.',
              publisher: 'Scribner',
              publishedDate: '2004',
              pageCount: 180,
            },
          },
        ],
      },
    });
    (a as unknown as { http: { get: jest.Mock } }).http.get = get;

    const r = await a.fetchByIsbn('9780743273565');

    expect(get).toHaveBeenCalledWith(
      'https://googleapis.invalid/volumes',
      expect.objectContaining({
        params: expect.objectContaining({
          q: 'isbn:9780743273565',
          key: 'test-google-key',
          fields: expect.stringContaining('description'),
        }),
      }),
    );
    expect(r).toMatchObject({
      isbn: '9780743273565',
      title: 'The Great Gatsby',
      author: 'F. Scott Fitzgerald',
      summary: 'A mysterious American millionaire tries to recapture the sweetheart of his youth.',
      source: 'googlebooks',
    });
  });

  it('BookRankAdapter maps bestseller details, rank, category, and relative covers', async () => {
    const a = new BookRankAdapter(cfg());
    const get = jest.fn().mockResolvedValue({
      data: {
        data: {
          books: [
            {
              isbn13: '9780063511637',
              title: 'WHISTLER',
              author: 'Ann Patchett',
              cover: '/cache/images/cover.jpg',
              description: 'Short English summary.',
              description_zh: '中文短简介。',
              details: 'Long English details.',
              details_zh: '中文长简介。',
              publisher: 'Harper',
              publication_dt: '2026-06-02',
              page_count: '320',
              category_id: 'hardcover-fiction',
              category_name: '精装小说',
              rank: 1,
            },
          ],
        },
      },
    });
    (a as unknown as { http: { get: jest.Mock } }).http.get = get;

    const books = await a.fetchBestsellers('hardcover-fiction', 10);

    expect(get).toHaveBeenCalledWith('/api/public/bestsellers/hardcover-fiction', { params: { limit: 10 } });
    expect(books[0]).toMatchObject({
      isbn: '9780063511637',
      title: 'WHISTLER',
      author: 'Ann Patchett',
      coverUrl: 'https://bookrank.example/cache/images/cover.jpg',
      summary: '中文长简介。',
      publisher: 'Harper',
      publishedDate: '2026-06-02',
      pageCount: 320,
      source: 'bookrank',
      category: 'hardcover-fiction',
      categoryName: '精装小说',
      rank: 1,
    });
  });
});
