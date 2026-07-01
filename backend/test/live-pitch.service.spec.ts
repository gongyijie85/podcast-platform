import { LivePitchService } from '../src/modules/book/live-pitch.service';
import type { BookLibraryItem } from '@shared/book';

describe('LivePitchService', () => {
  const book: BookLibraryItem = {
    id: 'lib-1',
    isbn: '9787544291170',
    title: '解忧杂货店',
    author: '东野圭吾',
    summary: '一家能解决烦恼的杂货店。',
    source: 'googlebooks',
    publisher: null,
    publishedDate: null,
    pageCount: null,
    coverUrl: null,
    category: null,
    categoryName: null,
    rank: null,
    queryCount: 1,
    metadataSyncStatus: 'synced',
    metadataSyncAttempts: 0,
    metadataSyncedAt: null,
    metadataSyncError: null,
    livePitch: null,
    livePitchGeneratedAt: null,
    firstSeenAt: '2026-06-18T00:00:00.000Z',
    lastSeenAt: '2026-06-18T00:00:00.000Z',
  };

  const library = {
    findByIsbn: jest.fn(),
    updateLivePitch: jest.fn(),
  };

  const config = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    library.findByIsbn.mockResolvedValue(book);
    library.updateLivePitch.mockImplementation(async (isbn: string, livePitch: string) => ({
      ...book,
      isbn,
      livePitch,
      livePitchGeneratedAt: new Date('2026-07-01T00:00:00.000Z').toISOString(),
    }));
  });

  function service(): LivePitchService {
    return new LivePitchService(config as never, library as never);
  }

  it('throws NotFoundException when book not found', async () => {
    library.findByIsbn.mockResolvedValueOnce(null);
    await expect(service().generate('9787544291170')).rejects.toThrow(/图书不存在/);
  });

  it('falls back to mock when LLM_API_KEY missing', async () => {
    config.get.mockReturnValue(undefined);
    const result = await service().generate('9787544291170');
    expect(result.isbn).toBe('9787544291170');
    expect(result.livePitch).toContain('解忧杂货店');
    expect(result.livePitch.length).toBeGreaterThan(20);
    expect(library.updateLivePitch).toHaveBeenCalledWith('9787544291170', expect.any(String));
  });

  it('falls back to mock when LLM call fails', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'thirdParty.llm.apiKey') return 'fake-key';
      if (key === 'thirdParty.llm.endpoint') return 'http://127.0.0.1:1';
      if (key === 'thirdParty.llm.model') return 'test-model';
      return undefined;
    });
    const result = await service().generate('9787544291170');
    expect(result.livePitch).toContain('解忧杂货店');
    expect(library.updateLivePitch).toHaveBeenCalled();
  }, 15000);
});
