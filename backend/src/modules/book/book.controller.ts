import { Body, Controller, Get, Inject, Param, Post, Query, forwardRef } from '@nestjs/common';
import { BookService } from './book.service';
import { BookRankImportDto, FetchMetadataDto, ResolveMetadataDto } from './dto/fetch-metadata.dto';
import { BookLibraryService } from './book-library.service';
import { Public } from '../auth/public.decorator';
import { QueueService } from '../queue/queue.service';
import type { BookLibraryListResult, BookRankImportResult, ResolveMetadataResult } from '@shared/book';

@Controller()
export class BookController {
  constructor(
    private readonly books: BookService,
    private readonly library: BookLibraryService,
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
  ): Promise<BookLibraryListResult> {
    return this.library.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      source,
      category,
    });
  }

  @Public()
  @Post('books/library/import/bookrank')
  async importBookRank(@Body() dto: BookRankImportDto): Promise<BookRankImportResult> {
    return this.library.importFromBookRank(dto);
  }

  @Public()
  @Get('books/metadata/:jobId')
  async getJobResult(@Param('jobId') jobId: string): Promise<{ status: string }> {
    return { status: 'queued' };
  }

}
