import { BadRequestException } from '@nestjs/common';
import { BookController } from '../src/modules/book/book.controller';

describe('BookController.resolveCoverByIsbn', () => {
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

  it('throws BadRequestException when isbn is missing', async () => {
    const controller = buildController();
    await expect(controller.resolveCoverByIsbn('')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns local library candidate when isbn matches', async () => {
    library.findByIsbn.mockResolvedValue({
      isbn: '9780135957059',
      title: 'The Pragmatic Programmer',
      author: 'Andrew Hunt',
      coverUrl: 'https://example.com/cover.jpg',
      summary: null,
      publisher: 'Addison-Wesley',
      publishedDate: '2019',
      pageCount: 352,
    });

    const controller = buildController();
    const result = await controller.resolveCoverByIsbn('9780135957059');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      isbn: '9780135957059',
      title: 'The Pragmatic Programmer',
      author: 'Andrew Hunt',
    });
    expect(result.rawRecognition).toMatchObject({
      isbn: '9780135957059',
      confidence: 'high',
    });
    expect(googleBooks.fetchByIsbn).not.toHaveBeenCalled();
  });

  it('falls back to Google Books when local library misses', async () => {
    library.findByIsbn.mockResolvedValue(null);
    library.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 5 });
    googleBooks.fetchByIsbn.mockResolvedValue({
      isbn: '9780135957059',
      title: 'The Pragmatic Programmer',
      author: 'Andrew Hunt',
      coverUrl: null,
      summary: null,
      publisher: null,
      publishedDate: null,
      pageCount: null,
      source: 'googlebooks',
    });
    googleBooks.searchByTitle.mockResolvedValue([]);

    const controller = buildController();
    const result = await controller.resolveCoverByIsbn('9780135957059');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].isbn).toBe('9780135957059');
  });

  it('returns empty candidates when both local and remote miss', async () => {
    library.findByIsbn.mockResolvedValue(null);
    library.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 5 });
    googleBooks.fetchByIsbn.mockResolvedValue(null);
    googleBooks.searchByTitle.mockResolvedValue([]);

    const controller = buildController();
    const result = await controller.resolveCoverByIsbn('9780000000000');

    expect(result.candidates).toHaveLength(0);
    expect(result.rawRecognition?.isbn).toBe('9780000000000');
  });
});
