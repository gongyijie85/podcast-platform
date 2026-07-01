import { Body, Controller, Get, Inject, Param, Patch, Post, Query, forwardRef } from '@nestjs/common';
import { BookService } from './book.service';
import { BookRankImportDto, FetchMetadataDto, ResolveMetadataDto } from './dto/fetch-metadata.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookLibraryService } from './book-library.service';
import { BookLibrarySyncService } from './book-library-sync.service';
import { LivePitchService } from './live-pitch.service';
import { Public } from '../auth/public.decorator';
import { QueueService } from '../queue/queue.service';
import type {
  BookLibraryItem,
  BookLibraryListResult,
  BookLibrarySyncStartResult,
  BookLibrarySyncStatusResult,
  BookRankImportResult,
  GenerateLivePitchResult,
  ResolveMetadataResult,
} from '@shared/book';

@Controller()
export class BookController {
  constructor(
    private readonly books: BookService,
    private readonly library: BookLibraryService,
    private readonly librarySync: BookLibrarySyncService,
    private readonly livePitch: LivePitchService,
    @Inject(forwardRef(() => QueueService))
    private readonly queues: QueueService,
  ) {}

  @Public()
  @Post('books/metadata')
  async fetchMetadata(@Body() dto: FetchMetadataDto): Promise<{ jobId: string }> {
    const jobId = await this.queues.enqueueMetadata(dto.isbns, dto.projectId);
    return { jobId };
  }

  @Public()
  @Post('books/metadata/resolve')
  async resolveMetadata(@Body() dto: ResolveMetadataDto): Promise<ResolveMetadataResult> {
    const result = await this.books.fetchBatch(dto.isbns);
    return {
      items: result.ok,
      failed: result.failed.map((isbn) => ({ isbn, reason: 'metadata_not_found' })),
    };
  }

  @Public()
  @Get('books/library')
  async listLibrary(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('source') source?: string,
    @Query('category') category?: string,
    @Query('syncStatus') syncStatus?: string,
  ): Promise<BookLibraryListResult> {
    return this.library.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      source,
      category,
      syncStatus,
    });
  }

  @Public()
  @Get('books/library/:isbn')
  async getBookDetail(@Param('isbn') isbn: string): Promise<BookLibraryItem | null> {
    return this.library.findByIsbn(isbn);
  }

  @Public()
  @Patch('books/library/:isbn')
  async updateBook(
    @Param('isbn') isbn: string,
    @Body() dto: UpdateBookDto,
  ): Promise<BookLibraryItem> {
    return this.library.updateLivePitch(isbn, dto.livePitch ?? '');
  }

  @Public()
  @Post('books/library/:isbn/pitch/generate')
  async generatePitch(@Param('isbn') isbn: string): Promise<GenerateLivePitchResult> {
    return this.livePitch.generate(isbn);
  }

  @Public()
  @Post('books/library/import/bookrank')
  async importBookRank(@Body() dto: BookRankImportDto): Promise<BookRankImportResult> {
    return this.library.importFromBookRank(dto);
  }

  @Public()
  @Post('books/library/sync')
  async syncLibrary(): Promise<BookLibrarySyncStartResult> {
    return this.librarySync.start();
  }

  @Public()
  @Get('books/library/sync/status')
  async getLibrarySyncStatus(): Promise<BookLibrarySyncStatusResult> {
    return this.librarySync.getStatusSnapshot();
  }

  @Public()
  @Get('books/metadata/:jobId')
  async getJobResult(@Param('jobId') jobId: string): Promise<{ status: string }> {
    return { status: 'queued' };
  }

}
