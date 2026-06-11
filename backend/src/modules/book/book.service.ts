import { Injectable, Logger } from '@nestjs/common';
import { OpenLibraryAdapter } from './adapters/open-library.adapter';
import { GoogleBooksAdapter } from './adapters/google-books.adapter';
import { normalizeIsbn } from '../../common/utils/isbn';
import type { BookMetadata } from '@shared/book';

@Injectable()
export class BookService {
  private readonly logger = new Logger(BookService.name);

  constructor(
    private readonly openLibrary: OpenLibraryAdapter,
    private readonly googleBooks: GoogleBooksAdapter,
  ) {}

  /**
   * Try OpenLibrary first, fall back to GoogleBooks.
   * `onProgress(done, total)` is called after each ISBN completes.
   */
  async fetchBatch(
    isbns: string[],
    onProgress?: (done: number, total: number) => Promise<void> | void,
  ): Promise<{ ok: BookMetadata[]; failed: string[] }> {
    const valid = isbns.map((i) => normalizeIsbn(i)).filter((x): x is string => Boolean(x));
    const total = valid.length;
    const ok: BookMetadata[] = [];
    const failed: string[] = [];

    for (let i = 0; i < total; i++) {
      const isbn = valid[i];
      let meta = await this.openLibrary.fetchByIsbn(isbn);
      if (!meta) meta = await this.googleBooks.fetchByIsbn(isbn);
      if (meta) ok.push(meta);
      else failed.push(isbn);
      if (onProgress) await onProgress(i + 1, total);
    }
    return { ok, failed };
  }
}
