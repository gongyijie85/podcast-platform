import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  forwardRef,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BookService } from './book.service';
import { BookRankImportDto, FetchMetadataDto, ResolveMetadataDto } from './dto/fetch-metadata.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { CoverRecognizeResultDto } from './dto/cover-recognize.dto';
import { BookLibraryService } from './book-library.service';
import { BookLibrarySyncService } from './book-library-sync.service';
import { CoverRecognizeService } from './cover-recognize.service';
import { GoogleBooksAdapter } from './adapters/google-books.adapter';
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

const COVER_UPLOAD_LIMIT = 5 * 1024 * 1024; // 5MB
const COVER_ALLOWED_MIMETYPES = ['image/jpeg', 'image/png'];

@Controller()
export class BookController {
  constructor(
    private readonly books: BookService,
    private readonly library: BookLibraryService,
    private readonly librarySync: BookLibrarySyncService,
    private readonly livePitch: LivePitchService,
    private readonly coverRecognize: CoverRecognizeService,
    private readonly googleBooks: GoogleBooksAdapter,
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

  /**
   * 拍照/上传封面 → agnes-2.0-flash 识别书名+作者 → Google Books 搜索候选
   * 返回候选图书列表（最多 5 本）+ 原始识别结果（用于调试/兜底提示）
   */
  @Public()
  @Post('books/cover/recognize')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: COVER_UPLOAD_LIMIT },
      fileFilter: (_req, file, cb) => {
        if (!COVER_ALLOWED_MIMETYPES.includes(file.mimetype)) {
          return cb(new BadRequestException('仅支持 JPEG/PNG 图片'), false);
        }
        cb(null, true);
      },
    }),
  )
  async recognizeCover(@UploadedFile() file: Express.Multer.File): Promise<CoverRecognizeResultDto> {
    if (!file) {
      throw new BadRequestException('请上传封面图片');
    }

    const recognition = await this.coverRecognize.recognize(file.buffer, file.mimetype);
    if (!recognition || !recognition.title) {
      return { candidates: [], rawRecognition: null };
    }

    const candidates = await this.googleBooks.searchByTitle(recognition.title, recognition.author);
    return {
      candidates: candidates.map((c) => ({
        isbn: c.isbn,
        title: c.title,
        author: c.author,
        coverUrl: c.coverUrl ?? null,
        summary: c.summary ?? null,
        publisher: c.publisher ?? null,
        publishedDate: c.publishedDate ?? null,
        pageCount: c.pageCount ?? null,
      })),
      rawRecognition: { title: recognition.title, author: recognition.author },
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
  async getJobResult(@Param('jobId') _jobId: string): Promise<{ status: string }> {
    return { status: 'queued' };
  }

}
