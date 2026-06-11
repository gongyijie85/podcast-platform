import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BookApiAdapter } from './book-api.adapter';
import type { BookMetadata } from '@shared/book';

/**
 * Fixture-book shape, mirrors `book-metadata.fixture.json` exactly.
 * `summary` and `coverUrl` are nullable to match `BookMetadata`'s optional fields.
 */
interface FixtureBook {
  isbn: string;
  title: string;
  author: string;
  coverUrl?: string;
  summary?: string;
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  source: 'mock' | 'openlibrary' | 'googlebooks';
}

interface FixtureRoot {
  books: FixtureBook[];
}

/**
 * MockBookMetadataAdapter — deterministic, fixture-driven book metadata lookup.
 *
 * Used by the v1.1 flow layer when Open Library / Google Books are unreachable.
 * Production deployments can rebind `BOOK_ADAPTER` to `OpenLibraryAdapter` (or
 * the GoogleBooks fallback) without touching `PipelineService` itself.
 *
 * Behaviour:
 *  - Loads `book-metadata.fixture.json` once at construction.
 *  - `fetchByIsbn(isbn)` returns the matching entry (with `source: 'mock'`)
 *    or `null` on miss.
 *  - `fetchBatch(isbns)` returns one entry per ISBN in input order; missing
 *    ISBNs surface as `null` slots (caller is responsible for null-filtering,
 *    see architecture §A2.2 invariant: `books.length + failedIsbns.length === isbns.length`).
 *  - 50..200ms simulated network jitter per call so progress callbacks fire
 *    naturally.
 */
@Injectable()
export class MockBookMetadataAdapter implements BookApiAdapter {
  readonly name = 'mock-book-metadata';
  private readonly logger = new Logger(MockBookMetadataAdapter.name);
  private readonly byIsbn: Map<string, BookMetadata>;

  constructor() {
    // In dev, `process.cwd()` is the `backend/` directory.
    // In the Docker container, the WORKDIR is `/app/backend/`.
    // Both environments have `src/test/fixtures/` as a child of CWD.
    const fixturePath = path.resolve(
      process.cwd(),
      'src',
      'test',
      'fixtures',
      'book-metadata.fixture.json',
    );
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as FixtureRoot;
    if (!parsed.books || !Array.isArray(parsed.books)) {
      throw new Error('book-metadata.fixture.json is missing the `books` array');
    }
    this.byIsbn = new Map<string, BookMetadata>();
    for (const book of parsed.books) {
      const meta: BookMetadata = {
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        coverUrl: book.coverUrl ?? null,
        summary: book.summary ?? null,
        publisher: book.publisher ?? null,
        publishedDate: book.publishedDate ?? null,
        pageCount: book.pageCount ?? null,
        source: 'mock',
      };
      this.byIsbn.set(book.isbn, meta);
    }
    this.logger.log(`MockBookMetadataAdapter loaded ${this.byIsbn.size} fixture books`);
  }

  async fetchByIsbn(isbn: string): Promise<BookMetadata | null> {
    if (!isbn) return null;
    // Simulate network jitter (50..200ms) per architecture §INCR-01.
    const delay = 50 + Math.floor(Math.random() * 150);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return this.byIsbn.get(isbn) ?? null;
  }

  async fetchBatch(isbns: string[]): Promise<BookMetadata[]> {
    if (!Array.isArray(isbns) || isbns.length === 0) return [];
    // One network round-trip per ISBN to preserve per-step progress semantics.
    // Misses are filtered out (caller can correlate via input ISBN order).
    const out: BookMetadata[] = [];
    for (const isbn of isbns) {
      const book = await this.fetchByIsbn(isbn);
      if (book) out.push(book);
    }
    return out;
  }
}
