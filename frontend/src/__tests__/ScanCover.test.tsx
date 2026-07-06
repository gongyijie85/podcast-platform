import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  recognizeCover: vi.fn(),
}));

vi.mock('@/api/book.api', () => ({
  bookApi: {
    recognizeCover: mocks.recognizeCover,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'scan.title': '拍摄封面识别图书',
        'scan.subtitle': '直播时拍一下封面，自动显示口播稿',
        'scan.button': '拍照 / 上传封面',
        'scan.recognizing': '正在识别封面...',
        'scan.candidates': `识别到 ${opts?.count ?? 0} 本候选图书，请选择`,
        'scan.noResults': '未识别到匹配图书',
        'scan.recognizeFailed': '识别失败，请重试或手动输入书名',
        'scan.manualInput': '手动输入书名',
        'scan.manualInputPlaceholder': '输入书名后回车搜索',
        'scan.tip': '识别准确率取决于封面清晰度，建议正面拍摄',
        'scan.selectCandidate': '选择此书',
        'common.search': '搜索',
      };
      return map[key] ?? key;
    },
  }),
}));

import { ScanCover } from '@/pages/ScanCover';

function renderScan(): void {
  render(
    <MemoryRouter initialEntries={['/scan']}>
      <Routes>
        <Route path="/scan" element={<ScanCover />} />
        <Route path="/books/:isbn" element={<div>book detail page</div>} />
        <Route path="/books" element={<div>book library page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ScanCover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('renders title, subtitle, button, and tip', () => {
    renderScan();
    expect(screen.getByText('拍摄封面识别图书')).toBeInTheDocument();
    expect(screen.getByText('直播时拍一下封面，自动显示口播稿')).toBeInTheDocument();
    expect(screen.getByText('拍照 / 上传封面')).toBeInTheDocument();
    expect(screen.getByText('识别准确率取决于封面清晰度，建议正面拍摄')).toBeInTheDocument();
  });

  it('shows candidates after successful recognition', async () => {
    mocks.recognizeCover.mockResolvedValueOnce({
      candidates: [
        {
          isbn: '9780135957059',
          title: 'The Pragmatic Programmer',
          author: 'Andrew Hunt',
          coverUrl: 'https://example.com/cover.jpg',
          summary: 'A book about pragmatic programming.',
          publisher: 'Addison-Wesley',
          publishedDate: '2019',
        },
      ],
      rawRecognition: { title: 'The Pragmatic Programmer', author: 'Andrew Hunt' },
    });

    renderScan();

    // 模拟 input file change
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    Object.defineProperty(input, 'files', {
      value: [new File(['fake'], 'cover.jpg', { type: 'image/jpeg' })],
      writable: false,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText('识别到 1 本候选图书，请选择')).toBeInTheDocument();
    });
    expect(screen.getByText('The Pragmatic Programmer')).toBeInTheDocument();
    expect(screen.getByText('Andrew Hunt')).toBeInTheDocument();
    expect(screen.getByText('选择此书')).toBeInTheDocument();
  });

  it('shows error and manual input when no candidates', async () => {
    mocks.recognizeCover.mockResolvedValueOnce({
      candidates: [],
      rawRecognition: { title: 'Unknown Title', author: undefined },
    });

    renderScan();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['fake'], 'cover.jpg', { type: 'image/jpeg' })],
      writable: false,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText('未识别到匹配图书')).toBeInTheDocument();
    });
    expect(screen.getByText('手动输入书名')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('输入书名后回车搜索')).toBeInTheDocument();
  });

  it('shows error message on recognizeCover throw', async () => {
    mocks.recognizeCover.mockRejectedValueOnce(new Error('network error'));

    renderScan();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['fake'], 'cover.jpg', { type: 'image/jpeg' })],
      writable: false,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText('识别失败，请重试或手动输入书名')).toBeInTheDocument();
    });
  });

  it('shows recognizing state during request', async () => {
    let resolvePromise: (value: unknown) => void = () => {};
    mocks.recognizeCover.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderScan();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['fake'], 'cover.jpg', { type: 'image/jpeg' })],
      writable: false,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText('正在识别封面...')).toBeInTheDocument();
    });

    // 解除阻塞
    resolvePromise({ candidates: [], rawRecognition: null });
    await waitFor(() => {
      expect(screen.queryByText('正在识别封面...')).not.toBeInTheDocument();
    });
  });
});
