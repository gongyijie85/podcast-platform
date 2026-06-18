import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { GenerateProjectDto, RegenerateProjectDto } from './dto/generate-project.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { QueueService } from '../queue/queue.service';
import type { ProjectDto, ShareLinkDto, SharedProjectDto, SyncProjectsPayload, SyncProjectsResult } from '@shared/project';

@Controller('projects')
export class ProjectController {
  constructor(
    private readonly svc: ProjectService,
    private readonly queues: QueueService,
  ) {}

  // Allow guest create (userId = null)
  @Public()
  @Post()
  create(
    @CurrentUser() user: AuthUser | null,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectDto> {
    return this.svc.create(user?.sub ?? null, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() p: PaginationDto) {
    return this.svc.list(user.sub, p.page, p.pageSize);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sync')
  sync(
    @CurrentUser() user: AuthUser,
    @Body() body: SyncProjectsPayload,
  ): Promise<SyncProjectsResult> {
    return this.svc.syncGuestProjects(user.sub, body.projectIds ?? []);
  }

  // Public-ish: anyone with projectId can read (for guest continuation)
  @Public()
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser | null): Promise<ProjectDto> {
    return this.svc.findById(id, user?.sub ?? null);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateConfigDto,
  ): Promise<ProjectDto> {
    return this.svc.update(id, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<null> {
    await this.svc.remove(id, user.sub);
    return null;
  }

  @Public()
  @Post(':id/generate')
  async generate(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | null,
    @Body() dto: GenerateProjectDto,
  ): Promise<{ accepted: true; jobIds: Record<string, string>; project: ProjectDto }> {
    const project = await this.svc.markGenerating(id, user?.sub ?? null, dto?.scriptTemplate);
    const { jobIds } = await this.queues.enqueuePipeline(id, { scriptTemplate: dto?.scriptTemplate });
    return { accepted: true, jobIds, project };
  }

  @Public()
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | null,
  ): Promise<{ cancelled: number; project: ProjectDto }> {
    const cancelled = await this.queues.cancelProjectJobs(id);
    const project = await this.svc.cancel(id, user?.sub ?? null);
    return { cancelled, project };
  }

  @Public()
  @Post(':id/regenerate')
  async regenerate(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | null,
    @Body() dto: RegenerateProjectDto,
  ): Promise<{ accepted: true; jobIds: Record<string, string>; project: ProjectDto }> {
    const project = await this.svc.markRegenerating(id, user?.sub ?? null, dto?.scriptTemplate);
    const { jobIds } = await this.queues.enqueuePipeline(id, {
      scriptTemplate: dto?.scriptTemplate,
      revisionPreset: dto?.revisionPreset,
      customInstruction: dto?.customInstruction,
    });
    return { accepted: true, jobIds, project };
  }

  @Public()
  @Post(':id/share')
  share(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | null,
    @Headers('origin') origin?: string,
  ): Promise<ShareLinkDto> {
    return this.svc.createShareLink(id, user?.sub ?? null, origin ?? '');
  }
}

@Controller('share')
export class ShareController {
  constructor(private readonly svc: ProjectService) {}

  @Public()
  @Get(':token')
  get(@Param('token') token: string): Promise<SharedProjectDto> {
    return this.svc.findSharedProject(token);
  }
}
