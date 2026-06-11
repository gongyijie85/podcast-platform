import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { generateSrt } from './srt.generator';
import { generateVtt } from './vtt.generator';
import { QueueService } from '../queue/queue.service';
import { ProgressGateway } from '../ws/progress.gateway';
import { randomUUID } from 'node:crypto';
import type { ProgressEvent } from '@shared/job';
import { STAGE_WEIGHTS } from '../queue/constants';

@Injectable()
export class SubtitleService {
  private readonly logger = new Logger(SubtitleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(forwardRef(() => QueueService))
    private readonly queues: QueueService,
    private readonly progress: ProgressGateway,
  ) {}

  async buildForProject(projectId: string): Promise<{ srt: string; vtt: string }> {
    const traceId = randomUUID();
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { scripts: { orderBy: { createdAt: 'desc' }, take: 1, include: { segments: { orderBy: { orderIndex: 'asc' } } } } },
    });
    if (!project || !project.scripts[0]) throw new Error('No script for project');

    const segments = project.scripts[0].segments;
    const segDtos = segments.map((s) => ({
      id: s.id,
      scriptId: s.scriptId,
      orderIndex: s.orderIndex,
      speaker: s.speaker as 'host' | 'guest',
      text: s.text,
      emotion: s.emotion as '开心' | '沉思' | '激昂' | '平缓' | '温柔' | '幽默' | '坚定' | '紧张',
      stage: s.stage as 'intro' | 'introduce' | 'interpret' | 'review' | 'suggest' | 'closing',
      startTime: s.startTime,
      endTime: s.endTime,
    }));
    const srt = generateSrt(segDtos);
    const vtt = generateVtt(segDtos);

    const srtKey = `subs/${projectId}/main.srt`;
    const vttKey = `subs/${projectId}/main.vtt`;
    await this.storage.put(srtKey, Buffer.from(srt, 'utf8'), 'text/plain');
    await this.storage.put(vttKey, Buffer.from(vtt, 'utf8'), 'text/vtt');

    await this.prisma.subtitleFile.upsert({
      where: { id: `${projectId}-srt` },
      create: { id: `${projectId}-srt`, projectId, format: 'srt', content: srt, storageKey: srtKey },
      update: { content: srt, storageKey: srtKey },
    });
    await this.prisma.subtitleFile.upsert({
      where: { id: `${projectId}-vtt` },
      create: { id: `${projectId}-vtt`, projectId, format: 'vtt', content: vtt, storageKey: vttKey },
      update: { content: vtt, storageKey: vttKey },
    });

    const event: ProgressEvent = {
      type: 'project.progress',
      projectId,
      stage: 'subtitle',
      progress: STAGE_WEIGHTS.subtitle,
      message: '字幕生成完成',
      timestamp: Date.now(),
      traceId,
    };
    await this.progress.emit(event);

    await this.queues.enqueueMix(projectId);
    return { srt, vtt };
  }

  async getContent(projectId: string, format: 'srt' | 'vtt'): Promise<string> {
    const sub = await this.prisma.subtitleFile.findFirst({
      where: { projectId, format },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) throw new Error(`No ${format} subtitle for project ${projectId}`);
    return sub.content;
  }
}
