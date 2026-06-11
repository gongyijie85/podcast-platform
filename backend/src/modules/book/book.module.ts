import { Module, forwardRef } from '@nestjs/common';
import { BookService } from './book.service';
import { BookController } from './book.controller';
import { OpenLibraryAdapter } from './adapters/open-library.adapter';
import { GoogleBooksAdapter } from './adapters/google-books.adapter';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [forwardRef(() => QueueModule)],
  providers: [BookService, OpenLibraryAdapter, GoogleBooksAdapter],
  controllers: [BookController],
  exports: [BookService, OpenLibraryAdapter, GoogleBooksAdapter],
})
export class BookModule {}
