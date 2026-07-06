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
import { CoverRecognizeResultDto, type CoverRecognizeCandidate, type CoverRawRecognition } from './dto/cover-recognize.dto';
import { TranslationService } from './translation.service';
import { BookLibraryService } from './book-library.service';
import { BookLibrarySyncService } from './book-library-sync.service';
import { CoverRecognizeService, type CoverRecognition } from './cover-recognize.service';
import { GoogleBooksAdapter } from './adapters/google-books.adapter';
import { LivePitchService } from './live-pitch.service';
import { Public } from '../auth/public.decorator';
import { QueueService } from '../queue/queue.service';
import type {
  BookLibraryItem,
  BookLibraryListResult,
  BookLibrarySyncStartResult,
  BookLibrarySyncStatusResult,
  BookMetadata,
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
    private readonly translation: TranslationService,
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
   * 拍照/上传封面 → agnes-2.0-flash 识别封面信息 → 多渠道搜索候选
   * 搜索优先级：ISBN 直连 → 本地书库 → Google Books
   * 返回候选图书列表（最多 5 本）+ 原始识别结果（用于调试/兜底提示/置信度展示）
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

    const candidates = await this.resolveCandidates(recognition);
    return {
      candidates: await this.dedupeAndLimit(candidates, recognition),
      rawRecognition: this.toRawRecognition(recognition),
    };
  }

  /**
   * 根据 ISBN 直接解析候选图书（用于前端条码扫描命中后快速定位）
   * 优先级：本地书库 → Google Books
   */
  @Public()
  @Post('books/cover/resolve-isbn')
  async resolveCoverByIsbn(@Body('isbn') isbn: string): Promise<CoverRecognizeResultDto> {
    if (!isbn || typeof isbn !== 'string') {
      throw new BadRequestException('请提供 ISBN');
    }

    const recognition: CoverRecognition = {
      title: '',
      isbn: isbn.trim(),
      confidence: 'high',
    };

    const candidates = await this.resolveCandidates(recognition);
    return {
      candidates: await this.dedupeAndLimit(candidates, recognition),
      rawRecognition: this.toRawRecognition(recognition),
    };
  }

  /**
   * 按书名手动搜索候选图书（用于 /scan 页面就地搜索兜底）
   * 搜索范围：本地书库 → Google Books
   */
  @Public()
  @Post('books/cover/search')
  async searchCoverCandidates(@Body('title') title: string): Promise<CoverRecognizeResultDto> {
    if (!title || typeof title !== 'string') {
      throw new BadRequestException('请提供书名');
    }

    const recognition: CoverRecognition = {
      title: title.trim(),
      confidence: 'medium',
    };

    const candidates = await this.resolveCandidates(recognition);
    return {
      candidates: await this.dedupeAndLimit(candidates, recognition),
      rawRecognition: this.toRawRecognition(recognition),
    };
  }

  /**
   * 按 ISBN → 本地书库 → Google Books 的优先级解析候选图书
   * 从 Google Books 拉到的记录会先 upsert 到本地书库，确保后续详情页能命中并缓存翻译
   */
  private async resolveCandidates(recognition: CoverRecognition): Promise<CoverRecognizeCandidate[]> {
    const candidates: CoverRecognizeCandidate[] = [];

    // 1. ISBN 直连：命中即唯一，速度最快、准确率最高
    if (recognition.isbn) {
      const localByIsbn = await this.library.findByIsbn(recognition.isbn);
      if (localByIsbn) {
        candidates.push(this.libraryItemToCandidate(localByIsbn));
      } else {
        const remoteByIsbn = await this.googleBooks.fetchByIsbn(recognition.isbn).catch(() => null);
        if (remoteByIsbn) {
          const saved = await this.library.upsertMany([remoteByIsbn]);
          if (saved[0]) candidates.push(this.libraryItemToCandidate(saved[0]));
        }
      }
    }

    // 2. 本地书库标题搜索：主播反复带货的书大概率已在书库
    if (candidates.length === 0 && recognition.title) {
      const localList = await this.library.list({ q: recognition.title, pageSize: 5 });
      candidates.push(...localList.items.map((item) => this.libraryItemToCandidate(item)));
    }

    // 3. Google Books 兜底：用书名+作者搜索外部数据
    if (candidates.length < 5 && recognition.title) {
      const remote = await this.googleBooks.searchByTitle(recognition.title, recognition.author).catch(() => []);
      const saved = await this.library.upsertMany(remote);
      candidates.push(...saved.map((item) => this.libraryItemToCandidate(item)));
    }

    return candidates;
  }

  /**
   * 将本地书库条目转换为候选 DTO
   */
  private libraryItemToCandidate(item: BookLibraryItem): CoverRecognizeCandidate {
    return {
      isbn: item.isbn,
      title: item.title,
      author: item.author,
      coverUrl: item.coverUrl ?? null,
      summary: item.summary ?? null,
      publisher: item.publisher ?? null,
      publishedDate: item.publishedDate ?? null,
      pageCount: item.pageCount ?? null,
      titleZh: item.titleZh ?? null,
      authorZh: item.authorZh ?? null,
      publisherZh: item.publisherZh ?? null,
      summaryZh: item.summaryZh ?? null,
    };
  }

  /**
   * 将 BookMetadata 转换为候选 DTO
   */
  private metadataToCandidate(item: BookMetadata): CoverRecognizeCandidate {
    return {
      isbn: item.isbn,
      title: item.title,
      author: item.author,
      coverUrl: item.coverUrl ?? null,
      summary: item.summary ?? null,
      publisher: item.publisher ?? null,
      publishedDate: item.publishedDate ?? null,
      pageCount: item.pageCount ?? null,
      titleZh: item.titleZh ?? null,
      authorZh: item.authorZh ?? null,
      publisherZh: item.publisherZh ?? null,
      summaryZh: item.summaryZh ?? null,
    };
  }

  /**
   * 候选去重并按匹配度排序，最多返回 5 本
   * 对非中文图书自动调用 LLM 翻译，保留英文原文并附加中文译文字段
   */
  private async dedupeAndLimit(
    candidates: CoverRecognizeCandidate[],
    recognition: CoverRecognition,
  ): Promise<CoverRecognizeCandidate[]> {
    const seen = new Set<string>();
    const unique = candidates.filter((item) => {
      if (seen.has(item.isbn)) return false;
      seen.add(item.isbn);
      return true;
    });

    const scored = unique.map((item) => ({
      item,
      score: this.scoreCandidate(item, recognition),
    }));

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 5).map(({ item }) => item);

    // 并行翻译前 5 本候选，失败时不阻塞返回原文
    const translated = await Promise.all(
      top.map(async (item) => {
        const sampleText = [item.title, item.author, item.summary].filter(Boolean).join(' ');
        if (!this.translation.shouldTranslate(recognition.language, sampleText)) {
          return item;
        }
        const zh = await this.translation.translateBook({
          title: item.title,
          author: item.author,
          publisher: item.publisher,
          summary: item.summary,
        });
        const merged = { ...item, ...zh };
        if (Object.keys(zh).length > 0) {
          // 缓存翻译结果到书库；候选可能来自非书库场景，失败时忽略
          await this.library.updateTranslation(item.isbn, zh).catch(() => undefined);
        }
        return merged;
      }),
    );

    return translated;
  }

  /**
   * 候选匹配度打分：ISBN 命中权重最高，其次书名/作者/出版社/封面/简介
   */
  private scoreCandidate(item: CoverRecognizeCandidate, recognition: CoverRecognition): number {
    let score = 0;
    const title = recognition.title.toLowerCase();
    const author = recognition.author?.toLowerCase() ?? '';
    const publisher = recognition.publisher?.toLowerCase() ?? '';
    const itemTitle = item.title.toLowerCase();
    const itemAuthor = item.author.toLowerCase();
    const itemPublisher = (item.publisher ?? '').toLowerCase();

    // ISBN 完全匹配：最高权重
    if (recognition.isbn && item.isbn === recognition.isbn) {
      score += 100;
    }

    // 书名相似度
    if (itemTitle === title) {
      score += 50;
    } else if (itemTitle.includes(title) || title.includes(itemTitle)) {
      score += 30;
    }

    // 作者匹配
    if (author && itemAuthor.includes(author)) {
      score += 20;
    }

    // 出版社匹配
    if (publisher && itemPublisher.includes(publisher)) {
      score += 10;
    }

    // 有封面图和简介的优先
    if (item.coverUrl) score += 5;
    if (item.summary) score += 3;

    return score;
  }

  /**
   * 将服务层识别结果转换为 DTO 中的原始识别结果
   */
  private toRawRecognition(recognition: CoverRecognition): CoverRawRecognition {
    return {
      title: recognition.title,
      author: recognition.author,
      isbn: recognition.isbn,
      publisher: recognition.publisher,
      publishedYear: recognition.publishedYear,
      language: recognition.language,
      confidence: recognition.confidence,
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
    const item = await this.library.findByIsbn(isbn);
    if (!item) return null;

    // 已缓存中文翻译则直接返回，避免重复调用 LLM
    if (item.titleZh) {
      return item;
    }

    const sampleText = [item.title, item.author, item.summary].filter(Boolean).join(' ');
    if (!this.translation.shouldTranslate(null, sampleText)) {
      return item;
    }

    const zh = await this.translation.translateBook({
      title: item.title,
      author: item.author,
      publisher: item.publisher,
      summary: item.summary,
    });
    if (Object.keys(zh).length > 0) {
      await this.library.updateTranslation(item.isbn, zh);
    }
    return { ...item, ...zh };
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
