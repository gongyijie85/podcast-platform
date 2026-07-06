import { BadRequestException } from '@nestjs/common';
import { BookController } from '../src/modules/book/book.controller';

describe('BookController.searchCoverCandidates', () => {
  const library = {
    findByIsbn: jest.fn(),
    list: jest.fn(),
  };
  const googleBooks = {
    fetchByIsbn: jest.fn(),
    searchByTitle: jest.fn(),
  };

  function buildController(): BookController {
    return new BookController(
      {} as never,
      library as never,
      {} as never,
      {} as never,
      {} as never,
      googleBooks as never,
      {} as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws BadRequestException when title is missing', async () => {
    const controller = buildController();
    await expect(controller.searchCoverCandidates('')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns local library candidates by title', async () => {
    library.list.mockResolvedValue({
      items: [
        {
          isbn: '9780135957059',
          title: 'The Pragmatic Programmer',
          author: 'Andrew Hunt',
          coverUrl: null,
          summary: null,
          publisher: null,
          publishedDate: null,
          pageCount: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 5,
    });
    googleBooks.searchByTitle.mockResolvedValue([]);

    const controller = buildController();
    const result = await controller.searchCoverCandidates('Pragmatic');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      isbn: '9780135957059',
      title: 'The Pragmatic Programmer',
    });
  });

  it('falls back to Google Books when local library misses', async () => {
    library.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 5 });
    googleBooks.searchByTitle.mockResolvedValue([
      {
        isbn: '9780135957059',
        title: 'The Pragmatic Programmer',
        author: 'Andrew Hunt',
        coverUrl: null,
        summary: null,
        publisher: null,
        publishedDate: null,
        pageCount: null,
        source: 'googlebooks',
      },
    ]);

    const controller = buildController();
    const result = await controller.searchCoverCandidates('Pragmatic Programmer');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].isbn).toBe('9780135957059');
  });

  it('returns empty candidates when no matches found', async () => {
    library.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 5 });
    googleBooks.searchByTitle.mockResolvedValue([]);

    const controller = buildController();
    const result = await controller.searchCoverCandidates('xyz-unknown');

    expect(result.candidates).toHaveLength(0);
  });
});
