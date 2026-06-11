import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES, STAGE_WEIGHTS } from '../constants';
import { ScriptService } from '../../script/script.service';
import { ProgressGateway } from '../../ws/progress.gateway';
import { randomUUID } from 'node:crypto';

@Processor(QUEUE_NAMES.SCRIPT, { concurrency: 1 })
export class ScriptProcessor extends WorkerHost {
  private readonly logger = new Logger(ScriptProcessor.name);

  constructor(
    private readonly scriptService: ScriptService,
    private readonly progress: ProgressGateway,
  ) {
    super();
  }

  async process(job: Job<{ projectId: string }>): Promise<{ segments: number }> {
    const { projectId } = job.data;
    const traceId = randomUUID();
    this.logger.log(`[${traceId}] script job for project ${projectId}`);

    await this.progress.emit({
      type: 'project.progress',
      projectId,
      stage: 'script',
      progress: STAGE_WEIGHTS.script,
      message: '开始生成脚本...',
      timestamp: Date.now(),
      traceId,
    });
    await job.updateProgress(10);

    const result = await this.scriptService.generateForProject(projectId);

    await this.progress.emit({
      type: 'project.progress',
      projectId,
      stage: 'script',
      progress: 50,
      message: `脚本生成完成 (${result.segments.length} 段)`,
      timestamp: Date.now(),
      traceId,
    });
    await job.updateProgress(100);

    return { segments: result.segments.length };
  }
}
