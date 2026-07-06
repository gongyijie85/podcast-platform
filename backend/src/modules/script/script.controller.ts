import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ScriptService } from './script.service';
import { SaveScriptDto } from './dto/script.dto';
import { Public } from '../auth/public.decorator';
import { QueueService } from '../queue/queue.service';
import { ProgressGateway } from '../ws/progress.gateway';
import { randomUUID } from 'node:crypto';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import type { GenerateScriptResponse, ScriptDto } from '@shared/script';
import type { ProgressEvent } from '@shared/job';
import { STAGE_WEIGHTS } from '../queue/constants';

@Controller()
export class ScriptController {
  constructor(
    private readonly svc: ScriptService,
    private readonly queues: QueueService,
    private readonly progress: ProgressGateway,
  ) {}

  @Public()
  @Post('projects/:id/script/generate')
  async generate(@Param('id') id: string): Promise<GenerateScriptResponse> {
    const traceId = randomUUID();
    const event: ProgressEvent = {
      type: 'project.progress',
      projectId: id,
      stage: 'script',
      progress: STAGE_WEIGHTS.script,
      message: '开始生成脚本',
      timestamp: Date.now(),
      traceId,
    };
    await this.progress.emit(event);
    const result = await this.svc.generateForProject(id);
    await this.progress.emit({
      ...event,
      progress: 50,
      message: `脚本生成完成 (${result.segments.length} 段)`,
    });
    return result;
  }

  @Public()
  @Get('projects/:id/script')
  async get(@Param('id') id: string): Promise<ScriptDto | null> {
    return this.svc.getByProject(id);
  }

  @Public()
  @Put('projects/:id/script')
  save(@Param('id') id: string, @Body() dto: SaveScriptDto): Promise<ScriptDto> {
    return this.svc.save(id, dto);
  }

  @Public()
  @Post('projects/:id/regenerate')
  async regenerate(
    @Param('id') id: string,
    @CurrentUser() _user: AuthUser | null,
  ): Promise<{ accepted: true }> {
    // Re-run the pipeline from TTS (script already saved).
    await this.queues.enqueueTts(id);
    await this.queues.enqueueSubtitle(id);
    await this.queues.enqueueMix(id);
    return { accepted: true };
  }

  @Public()
  @Post('projects/:id/cancel')
  async cancel(
    @Param('id') id: string,
    @CurrentUser() _user: AuthUser | null,
  ): Promise<{ cancelled: number }> {
    const removed = await this.queues.cancelProjectJobs(id);
    return { cancelled: removed };
  }
}
