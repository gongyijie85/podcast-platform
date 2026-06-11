import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '../constants';
import { SubtitleService } from '../../subtitle/subtitle.service';

@Processor(QUEUE_NAMES.SUBTITLE, { concurrency: 2 })
export class SubtitleProcessor extends WorkerHost {
  private readonly logger = new Logger(SubtitleProcessor.name);

  constructor(private readonly subtitleService: SubtitleService) {
    super();
  }

  async process(job: Job<{ projectId: string }>): Promise<{ srt: number; vtt: number }> {
    const { projectId } = job.data;
    this.logger.log(`subtitle job for project ${projectId}`);
    const r = await this.subtitleService.buildForProject(projectId);
    return { srt: r.srt.length, vtt: r.vtt.length };
  }
}
