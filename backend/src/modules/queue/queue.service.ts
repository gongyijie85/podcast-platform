import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { nanoid } from 'nanoid';
import { Counter, register } from 'prom-client';
import { QUEUE_NAMES, STAGE_TO_QUEUE_NAME, STAGE_WEIGHTS, Stage } from './constants';
import { PrismaService } from '../../prisma/prisma.service';
import { ScriptService } from '../script/script.service';
import { TtsService } from '../tts/tts.service';
import { SubtitleService } from '../subtitle/subtitle.service';
import { MixService } from '../mix/mix.service';
import type { ProgressEvent } from '@shared/job';
import type { RegenerateProjectPayload } from '@shared/project';

/**
 * 获取或创建一个 Counter，避免测试或热重载时重复注册同名指标。
 */
function getOrCreateCounter(name: string, help: string, labelNames: string[]): Counter {
  const existing = register.getSingleMetric(name) as Counter | undefined;
  if (existing) {
    return existing;
  }
  return new Counter({ name, help, labelNames });
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly localJobs = new Set<string>();
  private redisUnavailableUntil = 0;

  /**
   * BullMQ 队列指标：等待中、已完成、已失败
   * 这些 Counter 按 queue（队列名）分 label，供 Prometheus 抓取。
   */
  private readonly queueWaitingCounter = getOrCreateCounter(
    'bullmq_queue_waiting',
    'Total number of jobs added to BullMQ queues',
    ['queue'],
  );
  private readonly queueCompletedCounter = getOrCreateCounter(
    'bullmq_queue_completed',
    'Total number of jobs completed in BullMQ queues',
    ['queue'],
  );
  private readonly queueFailedCounter = getOrCreateCounter(
    'bullmq_queue_failed',
    'Total number of jobs failed in BullMQ queues',
    ['queue'],
  );

  constructor(
    @InjectQueue(QUEUE_NAMES.METADATA) private readonly metadataQ: Queue,
    @InjectQueue(QUEUE_NAMES.SCRIPT) private readonly scriptQ: Queue,
    @InjectQueue(QUEUE_NAMES.TTS) private readonly ttsQ: Queue,
    @InjectQueue(QUEUE_NAMES.SUBTITLE) private readonly subtitleQ: Queue,
    @InjectQueue(QUEUE_NAMES.MIX) private readonly mixQ: Queue,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => ScriptService))
    private readonly scriptService: ScriptService,
    @Inject(forwardRef(() => TtsService))
    private readonly ttsService: TtsService,
    @Inject(forwardRef(() => SubtitleService))
    private readonly subtitleService: SubtitleService,
    @Inject(forwardRef(() => MixService))
    private readonly mixService: MixService,
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
    await this.addOrRunLocal(
      this.scriptQ,
      'generateScript',
      { projectId, scriptOptions },
      ids.script,
      'script',
      projectId,
      () => this.scriptService.generateForProject(projectId, scriptOptions),
    );
    return { jobIds: ids };
  }

  async enqueueScript(projectId: string, scriptOptions: RegenerateProjectPayload = {}): Promise<string> {
    const id = `script-${projectId}-${nanoid(6)}`;
    await this.addOrRunLocal(
      this.scriptQ,
      'generateScript',
      { projectId, scriptOptions },
      id,
      'script',
      projectId,
      () => this.scriptService.generateForProject(projectId, scriptOptions),
    );
    return id;
  }

  async enqueueTts(projectId: string): Promise<string> {
    const id = `tts-${projectId}-${nanoid(6)}`;
    await this.addOrRunLocal(
      this.ttsQ,
      'synthesize',
      { projectId },
      id,
      'tts',
      projectId,
      () => this.ttsService.synthesizeAllForProject(projectId),
    );
    return id;
  }

  async enqueueSubtitle(projectId: string): Promise<string> {
    const id = `subtitle-${projectId}-${nanoid(6)}`;
    await this.addOrRunLocal(
      this.subtitleQ,
      'build',
      { projectId },
      id,
      'subtitle',
      projectId,
      () => this.subtitleService.buildForProject(projectId),
    );
    return id;
  }

  async enqueueMix(projectId: string): Promise<string> {
    const id = `mix-${projectId}-${nanoid(6)}`;
    await this.addOrRunLocal(
      this.mixQ,
      'mix',
      { projectId },
      id,
      'mix',
      projectId,
      () => this.mixService.mixProject(projectId),
    );
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

  private async addOrRunLocal(
    queue: Queue,
    jobName: string,
    data: Record<string, unknown>,
    jobId: string,
    stage: Stage,
    projectId: string,
    localRunner: () => Promise<unknown>,
  ): Promise<void> {
    if (this.shouldUseLocalQueue()) {
      this.scheduleLocalStage(stage, projectId, localRunner, 'local queue mode');
      return;
    }

    try {
      await this.withTimeout(
        queue.add(jobName, data, { jobId }),
        this.enqueueTimeoutMs(),
        `enqueue ${jobName}`,
      );
      this.incWaiting(queue.name);
    } catch (error) {
      this.redisUnavailableUntil = Date.now() + 60_000;
      this.logger.warn(
        `Queue enqueue failed for ${stage} project=${projectId}; using local background runner: ${(error as Error).message}`,
      );
      this.scheduleLocalStage(stage, projectId, localRunner, 'redis enqueue fallback');
    }
  }

  private scheduleLocalStage(
    stage: Stage,
    projectId: string,
    runner: () => Promise<unknown>,
    reason: string,
  ): void {
    const key = `${stage}:${projectId}`;
    if (this.localJobs.has(key)) {
      this.logger.debug(`Local ${stage} runner already scheduled for project=${projectId}`);
      return;
    }

    this.localJobs.add(key);
    this.logger.warn(`Scheduling local ${stage} runner for project=${projectId} (${reason})`);
    setImmediate(() => {
      void this.runLocalStage(stage, projectId, runner, key);
    });
  }

  private async runLocalStage(
    stage: Stage,
    projectId: string,
    runner: () => Promise<unknown>,
    key: string,
  ): Promise<void> {
    const queueName = STAGE_TO_QUEUE_NAME[stage];
    try {
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          status: 'generating',
          currentStage: stage,
          progress: STAGE_WEIGHTS[stage],
        },
      }).catch(() => undefined);
      await runner();
      this.incCompleted(queueName);
    } catch (error) {
      const message = (error as Error).message || 'local queue stage failed';
      this.logger.error(`Local ${stage} runner failed for project=${projectId}: ${message}`, (error as Error).stack);
      await this.prisma.errorLog.create({
        data: {
          userId: null,
          stage,
          message,
          context: { projectId, queueMode: this.queueMode() },
        },
      }).catch(() => undefined);
      await this.prisma.project.update({
        where: { id: projectId },
        data: { status: 'failed', currentStage: stage },
      }).catch(() => undefined);
      this.incFailed(queueName);
    } finally {
      this.localJobs.delete(key);
    }
  }

  /**
   * 记录队列事件指标，供 QueueModule 中的 QueueEvents 监听调用。
   */
  incWaiting(queue: string): void {
    this.queueWaitingCounter.inc({ queue });
  }
  incCompleted(queue: string): void {
    this.queueCompletedCounter.inc({ queue });
  }
  incFailed(queue: string): void {
    this.queueFailedCounter.inc({ queue });
  }

  isRedisMode(): boolean {
    return this.queueMode() === 'redis';
  }

  private shouldUseLocalQueue(): boolean {
    return this.queueMode() === 'local' || Date.now() < this.redisUnavailableUntil;
  }

  private queueMode(): 'redis' | 'local' {
    return this.config.get<string>('queue.mode') === 'redis' ? 'redis' : 'local';
  }

  private enqueueTimeoutMs(): number {
    const value = this.config.get<number>('queue.enqueueTimeoutMs') ?? 3000;
    return Math.max(250, value);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
