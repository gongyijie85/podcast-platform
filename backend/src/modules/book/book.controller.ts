import { Body, Controller, Get, Inject, Post, Query, forwardRef } from '@nestjs/common';
import { BookService } from './book.service';
import { FetchMetadataDto } from './dto/fetch-metadata.dto';
import { Public } from '../auth/public.decorator';
import { QueueService } from '../queue/queue.service';
import type { BgmTrackDto, BgmCategory } from '@shared/book';
import { PrismaService } from '../../prisma/prisma.service';

@Controller()
export class BookController {
  constructor(
    private readonly books: BookService,
    @Inject(forwardRef(() => QueueService))
    private readonly queues: QueueService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('books/metadata')
  async fetchMetadata(@Body() dto: FetchMetadataDto): Promise<{ jobId: string }> {
    const jobId = await this.queues.enqueueMetadata(dto.isbns, dto.projectId);
    return { jobId };
  }

  @Public()
  @Get('books/metadata/:jobId')
  async getJobResult(@Query('jobId') jobId: string): Promise<{ status: string }> {
    return { status: 'queued' };
  }

  @Public()
  @Get('bgm/tracks')
  async listBgmTracks(): Promise<BgmTrackDto[]> {
    const rows = await this.prisma.bgmTrack.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category as BgmCategory,
      storageKey: r.storageKey,
      durationMs: r.durationMs,
    }));
  }

  @Public()
  @Get('bgm/categories')
  async listBgmCategories(): Promise<BgmCategory[]> {
    const rows = await this.prisma.bgmTrack.findMany({ distinct: ['category'], select: { category: true } });
    return rows.map((r) => r.category as BgmCategory);
  }
}
