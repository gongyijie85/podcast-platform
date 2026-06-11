import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DoubaoAdapter } from './adapters/doubao.adapter';
import { QueueService } from '../queue/queue.service';
import type { ScriptDto, ScriptSegmentDto } from '@shared/script';
import type { BookMetadata } from '@shared/book';

@Injectable()
export class ScriptService {
  private readonly logger = new Logger(ScriptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly doubao: DoubaoAdapter,
    @Inject(forwardRef(() => QueueService))
    private readonly queues: QueueService,
  ) {}

  async generateForProject(projectId: string): Promise<{ script: ScriptDto; segments: ScriptSegmentDto[] }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { books: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!project) throw new Error(`Project ${projectId} not found`);

    const booksMeta: BookMetadata[] = project.books.map((b) => ({
      isbn: b.isbn,
      title: b.title,
      author: b.author,
      coverUrl: b.coverUrl,
      summary: b.summary,
      source: 'openlibrary' as const,
    }));

    const segments = await this.doubao.generateScript({
      projectId,
      title: project.title,
      mode: project.mode as 'independent' | 'merged',
      books: booksMeta,
      template: project.mode === 'merged' ? 'merge' : 'standard',
    });

    // Persist
    const script = await this.prisma.script.create({
      data: {
        projectId,
        version: 1,
        content: JSON.stringify(segments),
        rawText: segments.map((s) => s.text).join('\n'),
        wordCount: segments.reduce((acc, s) => acc + s.text.length, 0),
        segments: {
          create: segments.map((s) => ({
            orderIndex: s.orderIndex,
            speaker: s.speaker,
            text: s.text,
            emotion: s.emotion,
            stage: s.stage,
            startTime: null,
            endTime: null,
          })),
        },
      },
      include: { segments: true },
    });

    // Update project
    await this.prisma.project.update({
      where: { id: projectId },
      data: { currentStage: 'script' },
    });

    // Trigger next stage
    await this.queues.enqueueTts(projectId);

    return {
      script: this.toScriptDto(script),
      segments: script.segments.map(this.toSegmentDto),
    };
  }

  async getByProject(projectId: string): Promise<ScriptDto | null> {
    const script = await this.prisma.script.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { segments: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!script) return null;
    return this.toScriptDto(script);
  }

  async save(
    projectId: string,
    payload: { content: string; rawText: string; segments: Array<{ speaker: string; text: string; emotion: string; stage: string; id?: string }> },
  ): Promise<ScriptDto> {
    const existing = await this.prisma.script.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    if (!existing) {
      throw new Error('No script to update. Generate first.');
    }
    const newVersion = existing.version + 1;
    const script = await this.prisma.script.create({
      data: {
        projectId,
        version: newVersion,
        content: payload.content,
        rawText: payload.rawText,
        wordCount: payload.rawText.length,
        segments: {
          create: payload.segments.map((s, i) => ({
            orderIndex: i,
            speaker: s.speaker,
            text: s.text,
            emotion: s.emotion,
            stage: s.stage,
          })),
        },
      },
      include: { segments: { orderBy: { orderIndex: 'asc' } } },
    });
    return this.toScriptDto(script);
  }

  private toScriptDto(s: {
    id: string;
    projectId: string;
    version: number;
    content: string;
    rawText: string;
    wordCount: number;
    segments?: Array<{
      id: string;
      scriptId: string;
      orderIndex: number;
      speaker: string;
      text: string;
      emotion: string;
      stage: string;
      startTime: number | null;
      endTime: number | null;
    }>;
  }): ScriptDto {
    return {
      id: s.id,
      projectId: s.projectId,
      version: s.version,
      content: s.content,
      rawText: s.rawText,
      wordCount: s.wordCount,
      segments: s.segments?.map(this.toSegmentDto),
    };
  }

  private toSegmentDto = (s: {
    id: string;
    scriptId: string;
    orderIndex: number;
    speaker: string;
    text: string;
    emotion: string;
    stage: string;
    startTime: number | null;
    endTime: number | null;
  }): ScriptSegmentDto => ({
    id: s.id,
    scriptId: s.scriptId,
    orderIndex: s.orderIndex,
    speaker: s.speaker as ScriptSegmentDto['speaker'],
    text: s.text,
    emotion: s.emotion as ScriptSegmentDto['emotion'],
    stage: s.stage as ScriptSegmentDto['stage'],
    startTime: s.startTime,
    endTime: s.endTime,
  });
}
