import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '../constants';
import { TtsService } from '../../tts/tts.service';
import { ProgressGateway } from '../../ws/progress.gateway';
import { randomUUID } from 'node:crypto';

@Processor(QUEUE_NAMES.TTS, { concurrency: 1 })
export class TtsProcessor extends WorkerHost {
  private readonly logger = new Logger(TtsProcessor.name);

  constructor(
    private readonly ttsService: TtsService,
    private readonly progress: ProgressGateway,
  ) {
    super();
  }

  async process(job: Job<{ projectId: string }>): Promise<{ count: number }> {
    const { projectId } = job.data;
    const traceId = randomUUID();
    this.logger.log(`[${traceId}] tts job for project ${projectId}`);

    await this.progress.emit({
      type: 'project.progress',
      projectId,
      stage: 'tts',
      progress: 50,
      message: '开始 TTS 合成...',
      timestamp: Date.now(),
      traceId,
    });
    await job.updateProgress(10);

    const result = await this.ttsService.synthesizeAllForProject(projectId);
    await job.updateProgress(100);

    return { count: result.count };
  }
}
