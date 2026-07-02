import { TtsService } from '../src/modules/tts/tts.service';

describe('TtsService podcast generation', () => {
  const prisma = {
    project: {
      findUnique: jest.fn(),
    },
    audioFile: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    scriptSegment: {
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const volc = {
    listVoices: jest.fn().mockResolvedValue([]),
    preview: jest.fn(),
    synthesize: jest.fn(),
  };
  const azure = {
    listVoices: jest.fn().mockResolvedValue([]),
    preview: jest.fn(),
    synthesize: jest.fn(),
  };
  const xiaomi = {
    listVoices: jest.fn().mockResolvedValue([]),
    preview: jest.fn(),
    hasVoice: jest.fn().mockReturnValue(true),
    synthesize: jest.fn(),
  };
  const storage = {
    put: jest.fn().mockResolvedValue(undefined),
  };
  const queues = {
    enqueueSubtitle: jest.fn().mockResolvedValue('subtitle-job'),
    enqueueMix: jest.fn().mockResolvedValue('mix-job'),
  };
  const progress = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  const project = {
    id: 'project-1',
    subtitleOn: false,
    voices: [
      { role: 'host', voiceId: '冰糖', provider: 'xiaomi' },
      { role: 'guest', voiceId: '茉莉', provider: 'xiaomi' },
    ],
    scripts: [
      {
        id: 'script-1',
        segments: [
          { id: 'seg-1', speaker: 'host', text: '第一段文本' },
          { id: 'seg-2', speaker: 'guest', text: '第二段文本会触发失败兜底' },
        ],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.project.findUnique.mockResolvedValue(project);
    xiaomi.synthesize
      .mockResolvedValueOnce({ buffer: Buffer.from('real-audio'), durationMs: 1200 })
      .mockRejectedValueOnce(new Error('provider rate limited'));
  });

  function service(): TtsService {
    return new TtsService(
      prisma as never,
      volc as never,
      azure as never,
      xiaomi as never,
      storage as never,
      queues as never,
      progress as never,
    );
  }

  it('continues with a silence fallback when one segment fails and skips subtitle when disabled', async () => {
    const result = await service().synthesizeAllForProject('project-1');

    expect(result.count).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(storage.put).toHaveBeenCalledTimes(2);
    expect(prisma.scriptSegment.update).toHaveBeenCalledTimes(2);
    expect(queues.enqueueSubtitle).not.toHaveBeenCalled();
    expect(queues.enqueueMix).toHaveBeenCalledWith('project-1');
    expect(progress.emit).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      stage: 'subtitle',
      message: expect.stringContaining('已关闭'),
    }));
  });
});
