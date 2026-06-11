import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { ErrorCode } from '@shared/api';
import type {
  ProjectDto,
  ProjectBookDto,
  VoiceConfigDto,
  BgmConfigDto,
} from '@shared/project';
import { normalizeIsbn } from '../../common/utils/isbn';

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(userId: string | null, dto: CreateProjectDto): Promise<ProjectDto> {
    const max = this.config.get<number>('limits.maxBooks') || 20;
    if (dto.isbns.length === 0 || dto.isbns.length > max) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `isBns count must be 1..${max}`,
      });
    }
    for (const isbn of dto.isbns) {
      if (!normalizeIsbn(isbn)) {
        throw new BadRequestException({
          code: ErrorCode.ISBN_INVALID,
          message: `Invalid ISBN: ${isbn}`,
        });
      }
    }

    const project = await this.prisma.project.create({
      data: {
        userId: userId ?? null,
        title: dto.title,
        mode: dto.mode,
        status: 'draft',
        progress: 0,
        currentStage: null,
        voiceVolume: dto.voiceVolume ?? 80,
        subtitleOn: dto.subtitleEnabled ?? true,
        books: {
          create: dto.isbns.map((isbn, i) => ({
            isbn: normalizeIsbn(isbn)!,
            title: '(待抓取)',
            author: '未知',
            orderIndex: i,
          })),
        },
        voices: {
          create: dto.voices.map((v) => ({
            role: v.role,
            voiceId: v.voiceId,
            provider: v.provider,
          })),
        },
        bgmConfigs: {
          create: dto.bgmConfigs.map((b) => ({
            segment: b.segment,
            bgmTrackId: b.bgmTrackId,
            volume: b.volume,
            fadeInMs: b.fadeInMs,
            fadeOutMs: b.fadeOutMs,
          })),
        },
      },
      include: { books: true, voices: true, bgmConfigs: true },
    });

    return this.toDto(project);
  }

  async findById(id: string, userId: string | null): Promise<ProjectDto> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { books: true, voices: true, bgmConfigs: true },
    });
    if (!project) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Project not found' });
    }
    if (project.userId && userId && project.userId !== userId) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'Not your project' });
    }
    return this.toDto(project);
  }

  async list(userId: string | null, page: number, pageSize: number) {
    const where = userId ? { userId } : { userId: null };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { books: true, voices: true, bgmConfigs: true },
      }),
      this.prisma.project.count({ where }),
    ]);
    return {
      items: items.map((p) => this.toDto(p)),
      total,
      page,
      pageSize,
    };
  }

  async update(id: string, userId: string | null, dto: UpdateConfigDto): Promise<ProjectDto> {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Project not found' });
    }
    if (existing.userId && userId && existing.userId !== userId) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'Not your project' });
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.title !== undefined || dto.voiceVolume !== undefined || dto.subtitleEnabled !== undefined) {
        await tx.project.update({
          where: { id },
          data: {
            ...(dto.title !== undefined ? { title: dto.title } : {}),
            ...(dto.voiceVolume !== undefined ? { voiceVolume: dto.voiceVolume } : {}),
            ...(dto.subtitleEnabled !== undefined ? { subtitleOn: dto.subtitleEnabled } : {}),
          },
        });
      }
      if (dto.voices) {
        await tx.voiceConfig.deleteMany({ where: { projectId: id } });
        await tx.voiceConfig.createMany({
          data: dto.voices.map((v) => ({
            projectId: id,
            role: v.role,
            voiceId: v.voiceId,
            provider: v.provider,
          })),
        });
      }
      if (dto.bgmConfigs) {
        for (const b of dto.bgmConfigs) {
          const existing = await tx.bgmConfig.findFirst({
            where: { projectId: id, segment: b.segment },
          });
          if (existing) {
            await tx.bgmConfig.update({
              where: { id: existing.id },
              data: {
                bgmTrackId: b.bgmTrackId,
                volume: b.volume,
                fadeInMs: b.fadeInMs,
                fadeOutMs: b.fadeOutMs,
              },
            });
          } else {
            await tx.bgmConfig.create({
              data: {
                projectId: id,
                segment: b.segment,
                bgmTrackId: b.bgmTrackId,
                volume: b.volume,
                fadeInMs: b.fadeInMs,
                fadeOutMs: b.fadeOutMs,
              },
            });
          }
        }
      }
    });

    const updated = await this.prisma.project.findUnique({
      where: { id },
      include: { books: true, voices: true, bgmConfigs: true },
    });
    return this.toDto(updated!);
  }

  async remove(id: string, userId: string | null): Promise<void> {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Project not found' });
    }
    if (existing.userId && userId && existing.userId !== userId) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'Not your project' });
    }
    await this.prisma.project.delete({ where: { id } });
  }

  async setStatus(id: string, status: string, progress?: number, stage?: string | null): Promise<void> {
    await this.prisma.project.update({
      where: { id },
      data: {
        status,
        progress: progress ?? undefined,
        currentStage: stage === undefined ? undefined : stage,
      },
    });
  }

  private toDto(p: {
    id: string;
    userId: string | null;
    title: string;
    mode: string;
    status: string;
    progress: number;
    currentStage: string | null;
    createdAt: Date;
    updatedAt: Date;
    books: Array<{
      id: string;
      projectId: string;
      isbn: string;
      title: string;
      author: string;
      coverUrl: string | null;
      summary: string | null;
      orderIndex: number;
    }>;
    voices: Array<{ id: string; projectId: string; role: string; voiceId: string; provider: string }>;
    bgmConfigs: Array<{
      id: string;
      projectId: string;
      segment: string;
      bgmTrackId: string;
      volume: number;
      fadeInMs: number;
      fadeOutMs: number;
    }>;
  }): ProjectDto {
    return {
      id: p.id,
      userId: p.userId,
      title: p.title,
      mode: p.mode as ProjectDto['mode'],
      status: p.status as ProjectDto['status'],
      progress: p.progress,
      currentStage: (p.currentStage as ProjectDto['currentStage']) ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      books: p.books.map<ProjectBookDto>((b) => ({
        id: b.id,
        projectId: b.projectId,
        isbn: b.isbn,
        title: b.title,
        author: b.author,
        coverUrl: b.coverUrl,
        summary: b.summary,
        orderIndex: b.orderIndex,
      })),
      voices: p.voices.map<VoiceConfigDto>((v) => ({
        id: v.id,
        projectId: v.projectId,
        role: v.role as VoiceConfigDto['role'],
        voiceId: v.voiceId,
        provider: v.provider as VoiceConfigDto['provider'],
      })),
      bgmConfigs: p.bgmConfigs.map<BgmConfigDto>((bg) => ({
        id: bg.id,
        projectId: bg.projectId,
        segment: bg.segment as BgmConfigDto['segment'],
        bgmTrackId: bg.bgmTrackId,
        volume: bg.volume,
        fadeInMs: bg.fadeInMs,
        fadeOutMs: bg.fadeOutMs,
      })),
    };
  }
}
