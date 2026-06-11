import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '../constants';
import { MixService } from '../../mix/mix.service';

@Processor(QUEUE_NAMES.MIX, { concurrency: 1 })
export class MixProcessor extends WorkerHost {
  private readonly logger = new Logger(MixProcessor.name);

  constructor(private readonly mixService: MixService) {
    super();
  }

  async process(job: Job<{ projectId: string }>): Promise<{ durationMs: number }> {
    const { projectId } = job.data;
    this.logger.log(`mix job for project ${projectId}`);
    const r = await this.mixService.mixProject(projectId);
    return { durationMs: r.durationMs };
  }
}
