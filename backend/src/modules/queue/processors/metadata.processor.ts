import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES, STAGE_WEIGHTS } from '../constants';
import { BookService } from '../../book/book.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProgressGateway } from '../../ws/progress.gateway';
import { randomUUID } from 'node:crypto';

interface MetadataJobData {
  isbns: string[];
  projectId?: string;
}

@Processor(QUEUE_NAMES.METADATA, { concurrency: 2 })
export class MetadataProcessor extends WorkerHost {
  private readonly logger = new Logger(MetadataProcessor.name);

  constructor(
    private readonly bookService: BookService,
    private readonly prisma: PrismaService,
    private readonly progress: ProgressGateway,
  ) {
    super();
  }

  async process(job: Job<MetadataJobData>): Promise<{ ok: number; failed: string[] }> {
    const { isbns, projectId } = job.data;
    const traceId = randomUUID();
    this.logger.log(`[${traceId}] metadata job started for ${isbns.length} ISBNs`);

    await this.progress.emit({
      type: 'project.progress',
      projectId: projectId ?? 'metadata-batch',
      stage: 'metadata',
      progress: STAGE_WEIGHTS.metadata,
      message: `开始拉取 ${isbns.length} 本书的元数据`,
      timestamp: Date.now(),
      traceId,
    });

    const items = await this.bookService.fetchBatch(isbns, async (done, total) => {
      const pct = Math.round((done / total) * 20);
      await this.progress.emit({
        type: 'project.progress',
        projectId: projectId ?? 'metadata-batch',
        stage: 'metadata',
        progress: pct,
        message: `已抓取 ${done}/${total}`,
        timestamp: Date.now(),
        traceId,
      });
      await job.updateProgress(pct);
    });

    if (projectId) {
      // upsert into project_books
      for (let i = 0; i < items.ok.length; i++) {
        const m = items.ok[i];
        await this.prisma.projectBook.updateMany({
          where: { projectId, isbn: m.isbn },
          data: {
            title: m.title,
            author: m.author,
            coverUrl: m.coverUrl,
            summary: m.summary ?? null,
            orderIndex: i,
          },
        });
      }
    }

    await this.progress.emit({
      type: 'project.progress',
      projectId: projectId ?? 'metadata-batch',
      stage: 'metadata',
      progress: 25,
      message: '元数据抓取完成',
      timestamp: Date.now(),
      traceId,
    });

    return { ok: items.ok.length, failed: items.failed };
  }
}
