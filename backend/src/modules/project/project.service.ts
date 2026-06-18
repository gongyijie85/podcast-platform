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
  ShareLinkDto,
  SharedProjectDto,
  ScriptTemplate,
} from '@shared/project';
import type { BookMetadata } from '@shared/book';
import { normalizeIsbn } from '../../common/utils/isbn';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { BookService } from '../book/book.service';
import { BookLibraryService } from '../book/book-library.service';

const SCRIPT_TEMPLATES: ScriptTemplate[] = ['default', 'deep-review', 'casual-talk', 'academic', 'audio-overview'];

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly books: BookService,
    private readonly library?: BookLibraryService,
  ) {}

  async create(userId: string | null, dto: CreateProjectDto): Promise<ProjectDto> {
    const max = this.config.get<number>('limits.maxBooks') || 20;
    const normalizedIsbns = dto.isbns.map((isbn) => normalizeIsbn(isbn));
    if (dto.isbns.length === 0 || dto.isbns.length > max) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `isBns count must be 1..${max}`,
      });
    }
    for (let i = 0; i < dto.isbns.length; i++) {
      if (!normalizedIsbns[i]) {
        throw new BadRequestException({
          code: ErrorCode.ISBN_INVALID,
          message: `Invalid ISBN: ${dto.isbns[i]}`,
        });
      }
    }

    const metadataByIsbn = new Map<string, BookMetadata>();
    for (const book of dto.books ?? []) {
      const isbn = normalizeIsbn(book.isbn);
      if (!isbn) continue;
      metadataByIsbn.set(isbn, {
        isbn,
        title: book.title,
        author: book.author,
        coverUrl: book.coverUrl ?? null,
        summary: book.summary ?? null,
        podcastAngle: book.podcastAngle ?? null,
        publisher: book.publisher ?? null,
        publishedDate: book.publishedDate ?? null,
        source: book.source ?? 'mock',
      });
    }

    const missingIsbns = normalizedIsbns.filter((isbn): isbn is string => Boolean(isbn && !metadataByIsbn.has(isbn)));
    if (missingIsbns.length > 0) {
      try {
        const resolved = await this.books.fetchBatch(missingIsbns);
        for (const book of resolved.ok) {
          metadataByIsbn.set(book.isbn, book);
        }
      } catch {
        // Keep creation available when external metadata APIs are temporarily unavailable.
      }
    }

    const projectBooks = normalizedIsbns.map((isbn, i) => this.toProjectBookCreateInput(isbn!, metadataByIsbn.get(isbn!), i));
    const coverUrl = projectBooks.find((book) => book.coverUrl)?.coverUrl ?? this.buildCoverDataUrl(dto.title);

    const project = await this.prisma.project.create({
      data: {
        userId: userId ?? null,
        title: dto.title,
        coverUrl,
        mode: dto.mode,
        scriptTemplate: this.normalizeScriptTemplate(dto.scriptTemplate),
        status: 'draft',
        progress: 0,
        currentStage: null,
        voiceVolume: dto.voiceVolume ?? 80,
        subtitleOn: dto.subtitleEnabled ?? true,
        books: {
          create: projectBooks,
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

    if (this.library && project.books.length > 0) {
      await this.library.upsertMany(project.books.map((book) => ({
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        coverUrl: book.coverUrl,
        summary: book.summary,
        publisher: book.publisher,
        publishedDate: book.publishedDate,
        source: this.toBookSource(book.metadataSource),
      }))).catch(() => undefined);
    }

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
    this.assertOwner(project.userId, userId);
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

  async syncGuestProjects(userId: string, projectIds: string[]): Promise<{ synced: number }> {
    const ids = Array.from(new Set(projectIds.filter(Boolean)));
    if (ids.length === 0) return { synced: 0 };
    const result = await this.prisma.project.updateMany({
      where: {
        id: { in: ids },
        userId: null,
      },
      data: { userId },
    });
    return { synced: result.count };
  }

  async cancel(id: string, userId: string | null): Promise<ProjectDto> {
    const existing = await this.prisma.project.findUnique({
      where: { id },
      include: { books: true, voices: true, bgmConfigs: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Project not found' });
    }
    this.assertOwner(existing.userId, userId);
    const updated = await this.prisma.project.update({
      where: { id },
      data: { status: 'cancelled', currentStage: null },
      include: { books: true, voices: true, bgmConfigs: true },
    });
    return this.toDto(updated);
  }

  async markRegenerating(
    id: string,
    userId: string | null,
    scriptTemplate?: ScriptTemplate,
  ): Promise<ProjectDto> {
    const existing = await this.prisma.project.findUnique({
      where: { id },
      include: { books: true, voices: true, bgmConfigs: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Project not found' });
    }
    this.assertOwner(existing.userId, userId);
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        status: 'generating',
        progress: 0,
        currentStage: 'script',
        ...(scriptTemplate ? { scriptTemplate: this.normalizeScriptTemplate(scriptTemplate) } : {}),
      },
      include: { books: true, voices: true, bgmConfigs: true },
    });
    return this.toDto(updated);
  }

  async markGenerating(
    id: string,
    userId: string | null,
    scriptTemplate?: ScriptTemplate,
  ): Promise<ProjectDto> {
    const existing = await this.prisma.project.findUnique({
      where: { id },
      include: { books: true, voices: true, bgmConfigs: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Project not found' });
    }
    this.assertOwner(existing.userId, userId);
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        status: 'generating',
        progress: 0,
        currentStage: 'script',
        ...(scriptTemplate ? { scriptTemplate: this.normalizeScriptTemplate(scriptTemplate) } : {}),
      },
      include: { books: true, voices: true, bgmConfigs: true },
    });
    return this.toDto(updated);
  }

  async createShareLink(id: string, userId: string | null, origin = ''): Promise<ShareLinkDto> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Project not found' });
    }
    this.assertOwner(project.userId, userId);
    const token = randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const share = await this.prisma.shareLink.create({
      data: { projectId: id, token, expiresAt },
    });
    return {
      token: share.token,
      projectId: id,
      expiresAt: share.expiresAt.toISOString(),
      url: `${origin.replace(/\/$/, '') || ''}/share/${share.token}`,
    };
  }

  async findSharedProject(token: string): Promise<SharedProjectDto> {
    const share = await this.prisma.shareLink.findUnique({
      where: { token },
      include: { project: { include: { books: true, voices: true, bgmConfigs: true } } },
    });
    if (!share || share.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Share link not found or expired' });
    }
    return {
      project: this.toDto(share.project),
      share: {
        token: share.token,
        projectId: share.projectId,
        expiresAt: share.expiresAt.toISOString(),
      },
    };
  }

  async recordError(projectId: string, message: string, context?: Record<string, unknown>): Promise<void> {
    await this.prisma.errorLog.create({
      data: {
        userId: null,
        stage: 'project',
        message,
        context: (context ?? {}) as Prisma.InputJsonObject,
      },
    }).catch(() => undefined);
    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'failed' },
    }).catch(() => undefined);
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
    this.assertOwner(existing.userId, userId);
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
    coverUrl?: string | null;
    mode: string;
    scriptTemplate?: string | null;
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
      publisher?: string | null;
      publishedDate?: string | null;
      metadataSource?: string | null;
      podcastAngle?: string | null;
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
      coverUrl: p.coverUrl ?? null,
      mode: p.mode as ProjectDto['mode'],
      scriptTemplate: this.normalizeScriptTemplate(p.scriptTemplate),
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
        publisher: b.publisher ?? null,
        publishedDate: b.publishedDate ?? null,
        metadataSource: (b.metadataSource as ProjectBookDto['metadataSource']) ?? null,
        podcastAngle: b.podcastAngle ?? null,
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

  private assertOwner(ownerId: string | null, userId: string | null): void {
    if (ownerId && ownerId !== userId) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'Not your project' });
    }
  }

  private buildCoverDataUrl(title: string): string {
    const safe = title.replace(/[<>&]/g, '').slice(0, 18) || 'Podcast';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="3000"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#4f46e5"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs><rect width="3000" height="3000" fill="url(#g)"/><circle cx="2350" cy="650" r="360" fill="rgba(255,255,255,.18)"/><text x="220" y="1450" font-size="220" font-family="Arial, sans-serif" fill="#fff" font-weight="700">AI Podcast</text><text x="220" y="1780" font-size="150" font-family="Arial, sans-serif" fill="#eef2ff">${safe}</text></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  private toProjectBookCreateInput(
    isbn: string,
    meta: BookMetadata | undefined,
    orderIndex: number,
  ): Prisma.ProjectBookCreateWithoutProjectInput {
    return {
      isbn,
      title: meta?.title?.trim() || '(待抓取)',
      author: meta?.author?.trim() || '未知',
      coverUrl: meta?.coverUrl ?? null,
      summary: meta?.summary ?? null,
      publisher: meta?.publisher ?? null,
      publishedDate: meta?.publishedDate ?? null,
      metadataSource: meta?.source ?? null,
      podcastAngle: meta?.podcastAngle ?? null,
      orderIndex,
    };
  }

  private normalizeScriptTemplate(value?: string | null): ScriptTemplate {
    return SCRIPT_TEMPLATES.includes(value as ScriptTemplate) ? (value as ScriptTemplate) : 'default';
  }

  private toBookSource(value?: string | null): BookMetadata['source'] {
    return value === 'openlibrary' || value === 'googlebooks' || value === 'mock' || value === 'bookrank'
      ? value
      : 'mock';
  }
}
