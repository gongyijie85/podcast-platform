import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { nanoid } from 'nanoid';
import { QUEUE_NAMES, Stage } from './constants';
import { PrismaService } from '../../prisma/prisma.service';
import type { ProgressEvent } from '@shared/job';
import type { RegenerateProjectPayload } from '@shared/project';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.METADATA) private readonly metadataQ: Queue,
    @InjectQueue(QUEUE_NAMES.SCRIPT) private readonly scriptQ: Queue,
    @InjectQueue(QUEUE_NAMES.TTS) private readonly ttsQ: Queue,
    @InjectQueue(QUEUE_NAMES.SUBTITLE) private readonly subtitleQ: Queue,
    @InjectQueue(QUEUE_NAMES.MIX) private readonly mixQ: Queue,
    private readonly prisma: PrismaService,
  ) {}

  getQueue(name: string): Queue {
    switch (name) {
      case QUEUE_NAMES.METADATA:
        return this.metadataQ;
      case QUEUE_NAMES.SCRIPT:
        return this.scriptQ;
      case QUEUE_NAMES.TTS:
        return this.ttsQ;
      case QUEUE_NAMES.SUBTITLE:
        return this.subtitleQ;
      case QUEUE_NAMES.MIX:
        return this.mixQ;
      default:
        throw new Error(`Unknown queue: ${name}`);
    }
  }

  /**
   * Enqueue the 4-stage pipeline for a project: script → tts → subtitle → mix.
   * Stage transitions are done in the processors via `enqueueNext`.
   */
  async enqueuePipeline(
    projectId: string,
    scriptOptions: RegenerateProjectPayload = {},
  ): Promise<{ jobIds: Record<Stage, string> }> {
    const ids: Record<Stage, string> = {
      metadata: '',
      script: `script-${projectId}-${nanoid(6)}`,
      tts: `tts-${projectId}-${nanoid(6)}`,
      subtitle: `subtitle-${projectId}-${nanoid(6)}`,
      mix: `mix-${projectId}-${nanoid(6)}`,
    };
    // Start from script; metadata is handled separately at /api/books/metadata.
    await this.scriptQ.add('generateScript', { projectId, scriptOptions }, { jobId: ids.script });
    return { jobIds: ids };
  }

  async enqueueScript(projectId: string, scriptOptions: RegenerateProjectPayload = {}): Promise<string> {
    const id = `script-${projectId}-${nanoid(6)}`;
    await this.scriptQ.add('generateScript', { projectId, scriptOptions }, { jobId: id });
    return id;
  }

  async enqueueTts(projectId: string): Promise<string> {
    const id = `tts-${projectId}-${nanoid(6)}`;
    await this.ttsQ.add('synthesize', { projectId }, { jobId: id });
    return id;
  }

  async enqueueSubtitle(projectId: string): Promise<string> {
    const id = `subtitle-${projectId}-${nanoid(6)}`;
    await this.subtitleQ.add('build', { projectId }, { jobId: id });
    return id;
  }

  async enqueueMix(projectId: string): Promise<string> {
    const id = `mix-${projectId}-${nanoid(6)}`;
    await this.mixQ.add('mix', { projectId }, { jobId: id });
    return id;
  }

  async enqueueMetadata(isbns: string[], projectId: string): Promise<string> {
    const id = `meta-${projectId}-${nanoid(6)}`;
    await this.metadataQ.add('fetch', { isbns, projectId }, { jobId: id });
    return id;
  }

  /**
   * Cancel all active and queued jobs for a given project.
   */
  async cancelProjectJobs(projectId: string): Promise<number> {
    let removed = 0;
    const queues = [this.metadataQ, this.scriptQ, this.ttsQ, this.subtitleQ, this.mixQ];
    for (const q of queues) {
      const jobs = await q.getJobs(['active', 'waiting', 'delayed', 'paused']);
      for (const j of jobs) {
        if ((j.data as { projectId?: string }).projectId === projectId) {
          try {
            await j.remove();
            removed++;
          } catch (e) {
            this.logger.warn(`Failed to remove job ${j.id}: ${(e as Error).message}`);
          }
        }
      }
    }
    return removed;
  }

  async recordProgress(event: ProgressEvent): Promise<void> {
    await this.prisma.job.create({
      data: {
        id: `${event.projectId}-${event.stage}-${Date.now()}`,
        projectId: event.projectId,
        type: event.stage,
        status: event.progress >= 100 ? 'completed' : 'active',
        progress: event.progress,
        payload: event as unknown as object,
      },
    });
    if (event.progress >= 100) {
      await this.prisma.project.update({
        where: { id: event.projectId },
        data: { progress: 100, status: 'done' },
      });
    } else {
      await this.prisma.project.update({
        where: { id: event.projectId },
        data: { progress: event.progress, currentStage: event.stage, status: 'generating' },
      });
    }
  }
}
