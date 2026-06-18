import { ProjectService } from '../src/modules/project/project.service';
import { GenerateProjectDto, RegenerateProjectDto } from '../src/modules/project/dto/generate-project.dto';
import type { BookMetadata } from '@shared/book';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('ProjectService create metadata flow', () => {
  const prisma = {
    project: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const config = {
    get: jest.fn(),
  };
  const bookService = {
    fetchBatch: jest.fn(),
  };

  const baseDto = {
    title: 'The Creative Act 播客',
    mode: 'independent' as const,
    isbns: ['978-0241662151'],
    voices: [
      { role: 'host' as const, voiceId: 'BV001_streaming', provider: 'volcengine' as const },
      { role: 'guest' as const, voiceId: 'BV007_streaming', provider: 'volcengine' as const },
    ],
    bgmConfigs: [
      { segment: 'intro' as const, bgmTrackId: 'bgm-relax-1', volume: 50, fadeInMs: 1000, fadeOutMs: 1000 },
      { segment: 'body' as const, bgmTrackId: 'bgm-tech-1', volume: 30, fadeInMs: 1000, fadeOutMs: 1000 },
      { segment: 'outro' as const, bgmTrackId: 'bgm-human-1', volume: 50, fadeInMs: 1000, fadeOutMs: 1000 },
    ],
    voiceVolume: 80,
    subtitleEnabled: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue(20);
    prisma.project.create.mockImplementation(({ data }: { data: any }) => ({
      id: 'project-1',
      userId: data.userId,
      title: data.title,
      coverUrl: data.coverUrl,
      mode: data.mode,
      scriptTemplate: data.scriptTemplate,
      status: data.status,
      progress: data.progress,
      currentStage: data.currentStage,
      createdAt: new Date('2026-06-16T00:00:00.000Z'),
      updatedAt: new Date('2026-06-16T00:00:00.000Z'),
      books: data.books.create.map((book: any, index: number) => ({
        id: `book-${index}`,
        projectId: 'project-1',
        ...book,
      })),
      voices: data.voices.create.map((voice: any, index: number) => ({
        id: `voice-${index}`,
        projectId: 'project-1',
        ...voice,
      })),
      bgmConfigs: data.bgmConfigs.create.map((bgm: any, index: number) => ({
        id: `bgm-${index}`,
        projectId: 'project-1',
        ...bgm,
      })),
    }));
  });

  function service(): ProjectService {
    return new ProjectService(prisma as never, config as never, bookService as never);
  }

  it('persists provided book metadata and script template without resolving again', async () => {
    const book: BookMetadata = {
      isbn: '9780241662151',
      title: 'The Creative Act: A Way of Being',
      author: 'Rick Rubin',
      coverUrl: 'https://example.com/cover.jpg',
      summary: 'A book about creativity as a way of life.',
      podcastAngle: '适合从创作习惯与灵感来源切入。',
      publisher: 'Canongate',
      publishedDate: '2023',
      source: 'googlebooks',
    };

    const result = await service().create(null, {
      ...baseDto,
      books: [book],
      scriptTemplate: 'deep-review',
    });

    expect(bookService.fetchBatch).not.toHaveBeenCalled();
    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scriptTemplate: 'deep-review',
          books: {
            create: [
              expect.objectContaining({
                isbn: '9780241662151',
                title: book.title,
                author: book.author,
                summary: book.summary,
                publisher: book.publisher,
                publishedDate: book.publishedDate,
                metadataSource: 'googlebooks',
                podcastAngle: book.podcastAngle,
              }),
            ],
          },
        }),
        include: { books: true, voices: true, bgmConfigs: true },
      }),
    );
    expect(result.books?.[0]).toEqual(expect.objectContaining({
      title: book.title,
      metadataSource: 'googlebooks',
      podcastAngle: book.podcastAngle,
    }));
  });

  it('resolves metadata when only ISBNs are provided', async () => {
    bookService.fetchBatch.mockResolvedValueOnce({
      ok: [
        {
          isbn: '9780241662151',
          title: 'The Creative Act: A Way of Being',
          author: 'Rick Rubin',
          summary: 'A book about creativity.',
          podcastAngle: '适合聊创作方法。',
          source: 'googlebooks',
        } satisfies BookMetadata,
      ],
      failed: [],
    });

    await service().create(null, baseDto);

    expect(bookService.fetchBatch).toHaveBeenCalledWith(['9780241662151']);
    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scriptTemplate: 'default',
          books: {
            create: [
              expect.objectContaining({
                isbn: '9780241662151',
                title: 'The Creative Act: A Way of Being',
                author: 'Rick Rubin',
                metadataSource: 'googlebooks',
                podcastAngle: '适合聊创作方法。',
              }),
            ],
          },
        }),
      }),
    );
  });

  it('marks a project generating and stores the selected template', async () => {
    const project = {
      id: 'project-1',
      userId: null,
      books: [],
      voices: [],
      bgmConfigs: [],
    };
    prisma.project.findUnique.mockResolvedValueOnce(project);
    prisma.project.update.mockResolvedValueOnce({
      ...project,
      title: 'The Creative Act 播客',
      coverUrl: null,
      mode: 'independent',
      scriptTemplate: 'casual-talk',
      status: 'generating',
      progress: 0,
      currentStage: 'script',
      createdAt: new Date('2026-06-16T00:00:00.000Z'),
      updatedAt: new Date('2026-06-16T00:00:00.000Z'),
    });

    const result = await service().markGenerating('project-1', null, 'casual-talk');

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'project-1' },
        data: expect.objectContaining({
          status: 'generating',
          progress: 0,
          currentStage: 'script',
          scriptTemplate: 'casual-talk',
        }),
      }),
    );
    expect(result.status).toBe('generating');
    expect(result.scriptTemplate).toBe('casual-talk');
  });

  it('accepts the audio overview template in generate requests', async () => {
    const dto = plainToInstance(GenerateProjectDto, { scriptTemplate: 'audio-overview' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts quick revision payloads in regenerate requests', async () => {
    const dto = plainToInstance(RegenerateProjectDto, {
      scriptTemplate: 'audio-overview',
      revisionPreset: 'less-filler',
      customInstruction: '加强开场的问题意识。',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
