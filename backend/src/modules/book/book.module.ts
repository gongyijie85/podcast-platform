import { Module, forwardRef } from '@nestjs/common';
import { BookService } from './book.service';
import { BookController } from './book.controller';
import { OpenLibraryAdapter } from './adapters/open-library.adapter';
import { GoogleBooksAdapter } from './adapters/google-books.adapter';
import { BookRankAdapter } from './adapters/bookrank.adapter';
import { BookLibraryService } from './book-library.service';
import { BookLibrarySyncService } from './book-library-sync.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [forwardRef(() => QueueModule)],
  providers: [
    BookService,
    BookLibraryService,
    BookLibrarySyncService,
    OpenLibraryAdapter,
    GoogleBooksAdapter,
    BookRankAdapter,
  ],
  controllers: [BookController],
  exports: [BookService, BookLibraryService, BookLibrarySyncService, OpenLibraryAdapter, GoogleBooksAdapter],
})
export class BookModule {}
