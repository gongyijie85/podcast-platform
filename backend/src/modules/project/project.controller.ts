import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { QueueService } from '../queue/queue.service';
import type { ProjectDto } from '@shared/project';

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
  ): Promise<{ accepted: true; jobIds: Record<string, string> }> {
    void user;
    const { jobIds } = await this.queues.enqueuePipeline(id);
    return { accepted: true, jobIds };
  }
}
