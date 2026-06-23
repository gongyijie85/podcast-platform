import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../store/project.store';
import { useAuthStore } from '../store/auth.store';

const mocks = vi.hoisted(() => ({
  fetchMetadata: vi.fn(),
  resolveMetadata: vi.fn(),
  listLibrary: vi.fn(),
  importBookRank: vi.fn(),
  syncLibrary: vi.fn(),
  getLibrarySyncStatus: vi.fn(),
  createProject: vi.fn(),
  listProjects: vi.fn(),
  generateProject: vi.fn(),
  regenerateProject: vi.fn(),
  getProject: vi.fn(),
  createShare: vi.fn(),
  getScript: vi.fn(),
  saveScript: vi.fn(),
  listBgm: vi.fn(),
  listVoices: vi.fn(),
  useProgress: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'bookSearch.title': '图书搜索',
        'bookSearch.noResults': '没有结果',
        'book.fetching': '正在抓取',
        'dashboard.title': '仪表盘',
        'dashboard.welcome': '欢迎回来，访客',
        'dashboard.noProjects': '还没有项目',
        'dashboard.newProject': '新建项目',
        'app.tagline': 'ISBN → 一键生成双人对话播客',
        'projectCreate.title': '新建项目',
        'projectCreate.segmentMode': '分段模式',
        'projectCreate.scriptMode': '脚本模式',
        'common.next': '下一步',
        'common.prev': '上一步',
        'common.startGenerate': '开始生成',
        'config.on': '开启',
        'config.off': '关闭',
      })[key] ?? key,
  }),
}));

vi.mock('../components/book/BookSearchBar', () => ({
  BookSearchBar: ({ onSearch, maxIsbns }: { onSearch: (isbns: string[]) => void; maxIsbns?: number }) => {
    const makeIsbn = (index: number): string => {
      const body = `978000000${String(index).padStart(3, '0')}`;
      const sum = body
        .split('')
        .reduce((acc, digit, i) => acc + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
      return `${body}${(10 - (sum % 10)) % 10}`;
    };

    return (
      <div>
        <button type="button" onClick={() => onSearch(Array.from({ length: 20 }, (_, i) => makeIsbn(i)))}>
          mock search
        </button>
        <button type="button" onClick={() => onSearch(Array.from({ length: 45 }, (_, i) => makeIsbn(i)))}>
          mock bulk search
        </button>
        <span>mock max isbns: {maxIsbns ?? 'none'}</span>
      </div>
    );
  },
}));

vi.mock('../components/script/SixSegmentView', () => ({
  SixSegmentView: ({ onChange }: { onChange: (items: unknown[]) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange([
          {
            id: 'seg-1',
            speaker: 'host',
            stage: 'intro',
            text: '欢迎收听本期节目',
            emotion: '平缓',
          },
        ])
      }
    >
      fill segment
    </button>
  ),
}));

vi.mock('../components/tts/VoiceSelector', () => ({
  VoiceSelector: () => <div>voice selector</div>,
}));

vi.mock('../components/bgm/BGMPicker', () => ({
  BGMPicker: () => <div>bgm picker</div>,
}));

vi.mock('../hooks/useProgress', () => ({
  useProgress: () => mocks.useProgress(),
}));

vi.mock('../api/book.api', () => ({
  bookApi: {
    fetchMetadata: mocks.fetchMetadata,
    resolveMetadata: mocks.resolveMetadata,
    listLibrary: mocks.listLibrary,
    importBookRank: mocks.importBookRank,
    syncLibrary: mocks.syncLibrary,
    getLibrarySyncStatus: mocks.getLibrarySyncStatus,
  },
}));

vi.mock('../api/project.api', () => ({
  projectApi: {
    create: mocks.createProject,
    list: mocks.listProjects,
    generate: mocks.generateProject,
    regenerate: mocks.regenerateProject,
    get: mocks.getProject,
    createShare: mocks.createShare,
  },
}));

vi.mock('../api/script.api', () => ({
  scriptApi: {
    get: mocks.getScript,
    save: mocks.saveScript,
  },
}));

vi.mock('../api/bgm.api', () => ({
  bgmApi: {
    list: mocks.listBgm,
  },
}));

vi.mock('../api/tts.api', () => ({
  ttsApi: {
    listVoices: mocks.listVoices,
  },
}));

import { BookSearch } from '../pages/BookSearch';
import { Dashboard } from '../pages/Dashboard';
import { ProjectCreate } from '../pages/ProjectCreate';
import { ProjectDetail } from '../pages/ProjectDetail';

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <div>target search: {location.search}</div>;
}

const createdProject = {
  id: 'project-1',
  title: '测试项目',
  status: 'draft',
  progress: 0,
  currentStage: null,
};

const resolvedBook = {
  isbn: '9780241662151',
  title: 'The Creative Act: A Way of Being',
  author: 'Rick Rubin',
  coverUrl: null,
  summary: 'A book about creativity as a way of life.',
  podcastAngle: '适合从创作习惯与灵感来源切入。',
  publisher: 'Canongate',
  publishedDate: '2023',
  source: 'googlebooks' as const,
};

describe('page experience improvements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.getState().reset();
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
      loading: false,
      error: null,
    });
    mocks.useProgress.mockReturnValue({ progress: 0, stage: null, message: '', events: [] });
    mocks.listBgm.mockResolvedValue([]);
    mocks.listVoices.mockResolvedValue([]);
    mocks.createProject.mockResolvedValue(createdProject);
    mocks.listProjects.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    mocks.generateProject.mockResolvedValue({ accepted: true, jobIds: {} });
    mocks.regenerateProject.mockResolvedValue({ accepted: true, jobIds: {}, project: createdProject });
    mocks.getProject.mockResolvedValue(createdProject);
    mocks.createShare.mockResolvedValue({ token: 'share-token', projectId: 'project-1', url: '/share/share-token', expiresAt: '2026-06-25T00:00:00.000Z' });
    mocks.getScript.mockResolvedValue(null);
    mocks.saveScript.mockResolvedValue({});
    mocks.resolveMetadata.mockResolvedValue({ items: [], failed: [] });
    mocks.listLibrary.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    mocks.importBookRank.mockResolvedValue({ imported: 0, items: [] });
    mocks.syncLibrary.mockResolvedValue({
      accepted: true,
      status: { running: true, total: 0, processed: 0, updated: 0, failed: 0 },
    });
    mocks.getLibrarySyncStatus.mockResolvedValue({
      running: false,
      total: 0,
      processed: 0,
      updated: 0,
      failed: 0,
    });
  });

  it('shows a metadata error without creating local fallback books', async () => {
    mocks.resolveMetadata.mockRejectedValue(new Error('metadata timeout'));
    render(<BookSearch />, { wrapper: MemoryRouter });

    fireEvent.click(screen.getByRole('button', { name: 'mock search' }));

    expect(await screen.findByText(/图书信息获取失败：metadata timeout/)).toBeInTheDocument();
    expect(screen.queryByText(/示例书名/)).not.toBeInTheDocument();
  });

  it('does not request authenticated projects for guest dashboard', async () => {
    render(<Dashboard />, { wrapper: MemoryRouter });

    expect(await screen.findByText('还没有项目')).toBeInTheDocument();
    expect(mocks.listProjects).not.toHaveBeenCalled();
    expect(screen.queryByText(/Missing bearer token/)).not.toBeInTheDocument();
  });

  it('shows 20 organized books across 10-item pages with real summary details', async () => {
    mocks.resolveMetadata.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, i) => ({
        isbn: `97871213622${String(i).padStart(2, '0')}`,
        title: `测试书 ${i + 1}`,
        author: `作者 ${i + 1}`,
        coverUrl: null,
        summary: `简介 ${i + 1}`,
        podcastAngle: `播客切入点 ${i + 1}`,
        source: i % 2 === 0 ? 'openlibrary' : 'mock',
      })),
      failed: [{ isbn: '9787121362299', reason: 'metadata_not_found' }],
    });
    render(<BookSearch />, { wrapper: MemoryRouter });

    fireEvent.click(screen.getByRole('button', { name: 'mock search' }));

    expect(await screen.findByText(/本次搜索 · 共 20 本/)).toBeInTheDocument();
    expect(screen.getByText('测试书 1')).toBeInTheDocument();
    expect(screen.getByText('作者 1')).toBeInTheDocument();
    expect(screen.getByText('简介 1')).toBeInTheDocument();
    expect(screen.queryByText('播客切入点 1')).not.toBeInTheDocument();
    expect(screen.getAllByText('来源：Open Library')[0]).toBeInTheDocument();
    expect(screen.getByText(/未获取到 1 本书/)).toBeInTheDocument();
    expect(screen.queryByText('测试书 11')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /go to page 2/i }));

    expect(await screen.findByText('测试书 11')).toBeInTheDocument();
    expect(screen.queryByText('测试书 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '清空结果' }));

    expect(screen.getByText('输入 ISBN 开始整理')).toBeInTheDocument();
    expect(screen.queryByText('测试书 11')).not.toBeInTheDocument();
  });

  it('imports large ISBN batches in 20-book chunks for the shared library', async () => {
    mocks.resolveMetadata.mockImplementation(async (isbns: string[]) => ({
      items: isbns.map((isbn, i) => ({
        isbn,
        title: `批量书 ${isbn}`,
        author: `批量作者 ${i + 1}`,
        coverUrl: null,
        summary: `真实简介 ${isbn}`,
        source: 'openlibrary' as const,
      })),
      failed: [],
    }));

    render(<BookSearch />, { wrapper: MemoryRouter });

    fireEvent.click(screen.getByRole('button', { name: 'mock bulk search' }));

    expect(await screen.findByText(/本次搜索 · 共 45 本/)).toBeInTheDocument();
    expect(mocks.resolveMetadata).toHaveBeenCalledTimes(3);
    expect(mocks.resolveMetadata.mock.calls.map(([isbns]) => isbns.length)).toEqual([20, 20, 5]);
    expect(mocks.resolveMetadata.mock.calls.every(([isbns]) => isbns.length <= 20)).toBe(true);
    expect(screen.getByText('批量书 9780000000002')).toBeInTheDocument();
    expect(screen.getByText('真实简介 9780000000002')).toBeInTheDocument();
  });

  it('shows the shared book library and imports BookRank books', async () => {
    mocks.listLibrary
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 10 })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'lib-1',
            isbn: '9780063511637',
            title: 'WHISTLER',
            author: 'Ann Patchett',
            coverUrl: null,
            summary: '中文长简介。',
            source: 'bookrank',
            category: 'hardcover-fiction',
            categoryName: '精装小说',
            rank: 1,
            queryCount: 1,
            firstSeenAt: '2026-06-18T00:00:00.000Z',
            lastSeenAt: '2026-06-18T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      });
    mocks.importBookRank.mockResolvedValueOnce({ imported: 1, items: [] });

    render(<BookSearch />, { wrapper: MemoryRouter });

    expect(await screen.findByText('陈列库暂无图书')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /导入到陈列库/ }));

    expect(await screen.findByText('WHISTLER')).toBeInTheDocument();
    expect(screen.getByText('Ann Patchett')).toBeInTheDocument();
    expect(screen.getByText('中文长简介。')).toBeInTheDocument();
    expect(screen.getAllByText('BookRank').length).toBeGreaterThan(0);
    expect(mocks.importBookRank).toHaveBeenCalledWith({
      kind: 'bestsellers',
      category: 'hardcover-fiction',
      limit: 20,
    });
  });

  it('starts silent library metadata sync and marks pending books', async () => {
    mocks.listLibrary.mockResolvedValue({
      items: [
        {
          id: 'mock-lib-1',
          isbn: '9781785989117',
          title: '待同步图书 (9781785989117)',
          author: '待同步',
          coverUrl: null,
          summary: null,
          source: 'mock',
          category: null,
          categoryName: null,
          rank: null,
          queryCount: 1,
          metadataSyncStatus: 'pending',
          metadataSyncAttempts: 0,
          metadataSyncedAt: null,
          metadataSyncError: null,
          firstSeenAt: '2026-06-22T00:00:00.000Z',
          lastSeenAt: '2026-06-22T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    mocks.syncLibrary.mockResolvedValueOnce({
      accepted: true,
      status: { running: true, total: 12, processed: 3, updated: 2, failed: 1, currentIsbn: '9781785989117' },
    });

    render(<BookSearch />, { wrapper: MemoryRouter });

    expect(await screen.findByText('待同步图书 (9781785989117)')).toBeInTheDocument();
    expect(screen.getAllByText('待同步').length).toBeGreaterThan(0);
    expect(screen.getByText('正在后台同步真实图书简介')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '静默同步' }));

    await waitFor(() => expect(mocks.syncLibrary).toHaveBeenCalled());
    expect(await screen.findByText(/后台同步：3\/12 本/)).toBeInTheDocument();
    expect(screen.queryByText('GoogleBooksAdapter 离线 mock 数据。')).not.toBeInTheDocument();
  });

  it('filters the shared library by metadata sync status', async () => {
    render(<BookSearch />, { wrapper: MemoryRouter });

    expect(await screen.findByText('陈列库暂无图书')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('同步状态'), { target: { value: 'partial' } });
    fireEvent.click(screen.getByRole('button', { name: '筛选' }));

    await waitFor(() =>
      expect(mocks.listLibrary).toHaveBeenLastCalledWith(expect.objectContaining({
        page: 1,
        pageSize: 10,
        syncStatus: 'partial',
      })),
    );
  });

  it('retries the shared book library when the backend is waking up', async () => {
    mocks.listLibrary.mockReset();
    mocks.listLibrary
      .mockRejectedValueOnce(new Error('timeout of 90000ms exceeded'))
      .mockResolvedValueOnce({
        items: [
          {
            id: 'lib-cold-start',
            isbn: '9780063511637',
            title: 'WHISTLER',
            author: 'Ann Patchett',
            coverUrl: null,
            summary: '中文长简介。',
            source: 'bookrank',
            category: 'hardcover-fiction',
            categoryName: '精装小说',
            rank: 1,
            queryCount: 1,
            firstSeenAt: '2026-06-18T00:00:00.000Z',
            lastSeenAt: '2026-06-18T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      });

    render(<BookSearch />, { wrapper: MemoryRouter });

    expect(await screen.findByText('WHISTLER')).toBeInTheDocument();
    expect(screen.getByText('后端服务已唤醒，图书陈列库已恢复。')).toBeInTheDocument();
    expect(screen.queryByText(/图书陈列库加载失败/)).not.toBeInTheDocument();
    expect(mocks.listLibrary).toHaveBeenCalledTimes(2);
  });

  it('lets users pick multiple books from the organizer before creating a podcast', async () => {
    mocks.resolveMetadata.mockResolvedValue({
      items: Array.from({ length: 3 }, (_, i) => ({
        isbn: `97871213622${String(i).padStart(2, '0')}`,
        title: `测试书 ${i + 1}`,
        author: `作者 ${i + 1}`,
        coverUrl: null,
        summary: `简介 ${i + 1}`,
        source: 'openlibrary',
      })),
      failed: [],
    });
    render(
      <MemoryRouter initialEntries={['/book-search']}>
        <Routes>
          <Route path="/book-search" element={<BookSearch />} />
          <Route path="/projects/new" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'mock search' }));

    expect(await screen.findByText(/本次搜索 · 共 3 本/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('选择 测试书 1'));
    fireEvent.click(screen.getByLabelText('选择 测试书 2'));

    expect(screen.getByText('已选 2 本')).toBeInTheDocument();
    expect(screen.getByText('将按选择顺序进入本期播客内容。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '用选中书籍创建播客' }));

    expect(await screen.findByText(/target search:/)).toHaveTextContent(
      'target search: ?bookId=9787121362200&bookId=9787121362201',
    );
  });

  it('creates and starts generation from resolved book metadata without a manual script', async () => {
    mocks.resolveMetadata.mockResolvedValueOnce({ items: [resolvedBook], failed: [] });
    render(
      <MemoryRouter initialEntries={['/projects/new?bookId=978-0241662151&title=The+Creative+Act&author=Rick+Rubin']}>
        <ProjectCreate />
      </MemoryRouter>,
    );

    expect(await screen.findByText('The Creative Act: A Way of Being')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByText('专业导读')).toBeInTheDocument();
    expect(screen.getByText('默认六段式')).toBeInTheDocument();
    expect(screen.getByText('AI 深潜播客')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getAllByRole('button', { name: '开始生成' })[0]);

    await waitFor(() => expect(mocks.createProject).toHaveBeenCalled());
    expect(mocks.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        isbns: ['9780241662151'],
        books: [expect.objectContaining({ title: resolvedBook.title, podcastAngle: resolvedBook.podcastAngle })],
        scriptTemplate: 'audio-overview',
        voices: [
          { role: 'host', voiceId: '白桦', provider: 'xiaomi' },
          { role: 'guest', voiceId: '茉莉', provider: 'xiaomi' },
        ],
      }),
    );
    expect(mocks.saveScript).not.toHaveBeenCalled();
    expect(mocks.generateProject).toHaveBeenCalledWith('project-1', { scriptTemplate: 'audio-overview' });
  });

  it('shows episode brief, quality report, and quick revision controls on project detail', async () => {
    const detailProject = {
      id: 'project-1',
      title: '两本书的 AI 深潜播客',
      status: 'done',
      progress: 100,
      currentStage: null,
      mode: 'merged',
      scriptTemplate: 'audio-overview',
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
      books: [
        {
          id: 'book-1',
          projectId: 'project-1',
          isbn: '9780593804216',
          title: 'YESTERYEAR',
          author: 'Stephen King',
          coverUrl: null,
          summary: '中文简介一。',
          metadataSource: 'bookrank',
          orderIndex: 0,
        },
        {
          id: 'book-2',
          projectId: 'project-1',
          isbn: '9780063511637',
          title: 'WHISTLER',
          author: 'Ann Patchett',
          coverUrl: null,
          summary: '中文简介二。',
          metadataSource: 'bookrank',
          orderIndex: 1,
        },
      ],
      voices: [],
      bgmConfigs: [],
    };
    mocks.getProject.mockResolvedValue(detailProject);
    mocks.regenerateProject.mockResolvedValue({ accepted: true, jobIds: {}, project: detailProject });
    mocks.getScript.mockResolvedValue({
      id: 'script-1',
      projectId: 'project-1',
      version: 1,
      content: '{}',
      rawText: '脚本文本',
      wordCount: 4,
      segments: [],
      episodeBrief: {
        episodeQuestion: '两本新书如何讨论人与时代的关系？',
        openingPromise: '听众会理解它们为什么值得放在一起。',
        bookRoles: [
          { title: 'YESTERYEAR', role: '提供时间和记忆的入口。' },
          { title: 'WHISTLER', role: '提供关系和修复的入口。' },
        ],
        crossBookAngles: ['记忆与关系', '个人处境与时代压力'],
        listenerTakeaways: ['带着问题阅读。'],
        sourceLimits: ['不要虚构奖项或销量。'],
      },
      qualityReport: {
        status: 'warning',
        warnings: ['多书节目缺少明确的跨书比较。'],
        bookCoverage: [
          { title: 'YESTERYEAR', mentionCount: 2, mentioned: true, hasSubstantiveLine: true, summaryAvailable: true },
          { title: 'WHISTLER', mentionCount: 1, mentioned: true, hasSubstantiveLine: false, summaryAvailable: true },
        ],
        hasCrossBookComparison: false,
        fillerPhraseCount: 1,
        titleIntegrityWarnings: [],
        groundednessWarnings: [],
      },
    });

    render(
      <MemoryRouter initialEntries={['/projects/project-1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('两本书的 AI 深潜播客')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /脚本/ }));

    expect(await screen.findByText('节目策划')).toBeInTheDocument();
    expect(screen.getByText('两本新书如何讨论人与时代的关系？')).toBeInTheDocument();
    expect(screen.getByText('质量自检')).toBeInTheDocument();
    expect(screen.getByText('多书节目缺少明确的跨书比较。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '少口头禅' }));

    await waitFor(() => expect(mocks.regenerateProject).toHaveBeenCalledWith('project-1', {
      scriptTemplate: 'audio-overview',
      revisionPreset: 'less-filler',
      customInstruction: undefined,
    }));
  });

  it('defaults to merged mode when multiple books are loaded from the organizer', async () => {
    mocks.resolveMetadata.mockResolvedValueOnce({
      items: [
        resolvedBook,
        {
          isbn: '9780743273565',
          title: 'The Great Gatsby',
          author: 'F. Scott Fitzgerald',
          coverUrl: null,
          summary: 'A Jazz Age novel about wealth, desire, illusion, and social class.',
          source: 'openlibrary' as const,
        },
      ],
      failed: [],
    });

    render(
      <MemoryRouter initialEntries={['/projects/new?bookId=9780061120084&bookId=9780743273565']}>
        <ProjectCreate />
      </MemoryRouter>,
    );

    expect(await screen.findByText('The Creative Act: A Way of Being')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '合并为单期' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a specific error when pipeline startup fails', async () => {
    mocks.resolveMetadata.mockResolvedValueOnce({ items: [resolvedBook], failed: [] });
    mocks.generateProject.mockRejectedValue(new Error('queue offline'));
    render(
      <MemoryRouter initialEntries={['/projects/new?bookId=9780241662151&title=The+Creative+Act&author=Rick+Rubin']}>
        <ProjectCreate />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getAllByRole('button', { name: '开始生成' })[0]);

    expect(await screen.findByText(/queue offline/)).toBeInTheDocument();
  });
});
