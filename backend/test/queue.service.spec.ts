import { QueueService } from '../src/modules/queue/queue.service';

const waitForTick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('QueueService local fallback', () => {
  const queues = {
    metadata: { add: jest.fn(), getJobs: jest.fn() },
    script: { add: jest.fn(), getJobs: jest.fn() },
    tts: { add: jest.fn(), getJobs: jest.fn() },
    subtitle: { add: jest.fn(), getJobs: jest.fn() },
    mix: { add: jest.fn(), getJobs: jest.fn() },
  };
  const prisma = {
    project: { update: jest.fn().mockResolvedValue({}) },
    errorLog: { create: jest.fn().mockResolvedValue({}) },
    job: { create: jest.fn().mockResolvedValue({}) },
  };
  const config = {
    get: jest.fn(),
  };
  const scriptService = { generateForProject: jest.fn().mockResolvedValue({}) };
  const ttsService = { synthesizeAllForProject: jest.fn().mockResolvedValue({}) };
  const subtitleService = { buildForProject: jest.fn().mockResolvedValue({}) };
  const mixService = { mixProject: jest.fn().mockResolvedValue({}) };

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string) => {
      if (key === 'queue.mode') return 'local';
      if (key === 'queue.enqueueTimeoutMs') return 5;
      return undefined;
    });
  });

  function service(): QueueService {
    return new QueueService(
      queues.metadata as never,
      queues.script as never,
      queues.tts as never,
      queues.subtitle as never,
      queues.mix as never,
      prisma as never,
      config as never,
      scriptService as never,
      ttsService as never,
      subtitleService as never,
      mixService as never,
    );
  }

  it('returns from enqueuePipeline immediately in local queue mode and runs script in the background', async () => {
    const result = await service().enqueuePipeline('project-1', { scriptTemplate: 'audio-overview' });

    expect(result.jobIds.script).toContain('project-1');
    expect(queues.script.add).not.toHaveBeenCalled();

    await waitForTick();
    await waitForTick();

    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'project-1' },
      data: expect.objectContaining({
        status: 'generating',
        currentStage: 'script',
        progress: 25,
      }),
    }));
    expect(scriptService.generateForProject).toHaveBeenCalledWith('project-1', {
      scriptTemplate: 'audio-overview',
    });
  });

  it('falls back to local runner when Redis enqueue hangs', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'queue.mode') return 'redis';
      if (key === 'queue.enqueueTimeoutMs') return 5;
      return undefined;
    });
    queues.script.add.mockReturnValueOnce(new Promise(() => undefined));

    await service().enqueueScript('project-2');
    await waitForTick();
    await waitForTick();

    expect(queues.script.add).toHaveBeenCalled();
    expect(scriptService.generateForProject).toHaveBeenCalledWith('project-2', {});
  });

  it('marks the project failed when a local stage throws', async () => {
    ttsService.synthesizeAllForProject.mockRejectedValueOnce(new Error('tts exploded'));

    await service().enqueueTts('project-3');
    await waitForTick();
    await waitForTick();

    expect(prisma.errorLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        stage: 'tts',
        message: 'tts exploded',
      }),
    }));
    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'project-3' },
      data: { status: 'failed', currentStage: 'tts' },
    }));
  });
});
