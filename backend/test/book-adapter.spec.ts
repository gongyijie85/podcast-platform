import { OpenLibraryAdapter } from '../src/modules/book/adapters/open-library.adapter';
import { GoogleBooksAdapter } from '../src/modules/book/adapters/google-books.adapter';
import { ConfigService } from '@nestjs/config';

const cfg = (): ConfigService =>
  ({
    get: (k: string) => {
      const map: Record<string, string> = {
        'thirdParty.openLibrary.base': 'https://openlibrary.invalid',
        'thirdParty.googleBooks.base': 'https://googleapis.invalid',
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

  it('GoogleBooksAdapter returns mock when network fails', async () => {
    const a = new GoogleBooksAdapter(cfg());
    const r = await a.fetchByIsbn('9999999999999');
    expect(r).not.toBeNull();
    expect(r!.source).toBe('mock');
  });
});
