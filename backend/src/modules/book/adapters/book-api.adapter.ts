import type { BookMetadata } from '@shared/book';

export interface BookApiAdapter {
  readonly name: string;
  fetchByIsbn(isbn: string): Promise<BookMetadata | null>;
  fetchBatch?(isbns: string[]): Promise<BookMetadata[]>;
}
