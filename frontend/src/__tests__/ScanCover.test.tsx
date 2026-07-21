import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  recognizeCover: vi.fn(),
  lookupLibraryByIsbn: vi.fn(),
  resolveCoverByIsbn: vi.fn(),
  searchCoverCandidates: vi.fn(),
}));

const scanIsbnMock = vi.hoisted(() => vi.fn());
const startVideoScanMock = vi.hoisted(() => vi.fn());

const scanHistoryMock = vi.hoisted(() => ({
  getScanHistory: vi.fn(),
  addScanHistory: vi.fn(),
  clearScanHistory: vi.fn(),
}));

vi.mock('@/api/book.api', () => ({
  bookApi: {
    recognizeCover: mocks.recognizeCover,
    lookupLibraryByIsbn: mocks.lookupLibraryByIsbn,
    resolveCoverByIsbn: mocks.resolveCoverByIsbn,
    searchCoverCandidates: mocks.searchCoverCandidates,
  },
}));

vi.mock('@/utils/barcode-scanner', () => ({
  scanIsbnFromImage: scanIsbnMock,
  startIsbnVideoScan: startVideoScanMock,
}));

vi.mock('@/utils/scan-history', () => ({
  getScanHistory: scanHistoryMock.getScanHistory,
  addScanHistory: scanHistoryMock.addScanHistory,
  clearScanHistory: scanHistoryMock.clearScanHistory,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'scan.title': '拍摄封面识别图书',
        'scan.subtitle': '直播时拍一下封面，自动显示口播稿',
        'scan.button': '拍照 / 上传封面',
        'scan.liveScan': '实时扫码',
        'scan.stopLiveScan': '停止扫码',
        'scan.cameraStarting': '正在启动摄像头...',
        'scan.cameraError': '无法使用摄像头，请检查权限或改用拍照识别',
        'scan.historyEmpty': '暂无识别记录',
        'scan.recognizing': '正在识别封面...',
        'scan.compressing': '正在压缩图片...',
        'scan.scanningBarcode': '正在扫描条码...',
        'scan.candidates': `识别到 ${opts?.count ?? 0} 本候选图书，请选择`,
        'scan.noResults': '未识别到匹配图书',
        'scan.recognizeFailed': '识别失败，请重试或手动输入书名',
        'scan.manualInput': '手动输入书名',
        'scan.manualInputPlaceholder': '输入书名后回车搜索',
        'scan.manualSearchFailed': '手动搜索失败，请稍后重试',
        'scan.tip': '识别准确率取决于封面清晰度，建议正面拍摄',
        'scan.selectCandidate': '选择此书',
        'scan.frameHint': '请将书背面的 ISBN 条码对准此区域，保持光线充足、条码清晰',
        'scan.lowConfidence': '识别结果不确定',
        'scan.libraryHit': '已命中项目书库',
        'scan.recentHistory': '最近识别',
        'scan.clearHistory': '清空历史',
        'common.search': '搜索',
      };
      return map[key] ?? key;
    },
  }),
}));

import { ScanCover } from '@/pages/ScanCover';

function renderScan() {
  return render(
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
    scanIsbnMock.mockReset();
    startVideoScanMock.mockReset();
    scanHistoryMock.getScanHistory.mockReturnValue([]);
    mocks.lookupLibraryByIsbn.mockResolvedValue(null);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('renders title, subtitle, button, and tip', () => {
    renderScan();
    expect(screen.getByText('拍摄封面识别图书')).toBeInTheDocument();
    expect(screen.getByText('直播时拍一下封面，自动显示口播稿')).toBeInTheDocument();
    expect(screen.getByText('拍照 / 上传封面')).toBeInTheDocument();
    expect(screen.getByText('实时扫码')).toBeInTheDocument();
    expect(screen.getByText('识别准确率取决于封面清晰度，建议正面拍摄')).toBeInTheDocument();
    expect(screen.getByText('手动输入书名')).toBeInTheDocument();
    expect(screen.getByText('暂无识别记录')).toBeInTheDocument();
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
    expect(screen.getByPlaceholderText('输入书名后回车搜索')).toBeInTheDocument();
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
      () =>
        new Promise((resolve) => {
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

  it('renders frame hint for better shooting guidance', () => {
    renderScan();
    expect(
      screen.getByText('请将书背面的 ISBN 条码对准此区域，保持光线充足、条码清晰'),
    ).toBeInTheDocument();
  });

  it('shows low confidence warning when recognition is uncertain', async () => {
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
      rawRecognition: {
        title: 'The Pragmatic Programmer',
        author: 'Andrew Hunt',
        confidence: 'low',
      },
    });

    renderScan();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['fake'], 'cover.jpg', { type: 'image/jpeg' })],
      writable: false,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText('识别结果不确定')).toBeInTheDocument();
    });
  });

  it('shows scanning barcode state before recognition', async () => {
    scanIsbnMock.mockResolvedValue(null);
    mocks.recognizeCover.mockResolvedValueOnce({ candidates: [], rawRecognition: null });

    renderScan();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['fake'], 'cover.jpg', { type: 'image/jpeg' })],
      writable: false,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText('正在扫描条码...')).toBeInTheDocument();
    });
  });

  it('uses ISBN resolve when barcode is detected', async () => {
    scanIsbnMock.mockResolvedValue('9780135957059');
    mocks.resolveCoverByIsbn.mockResolvedValueOnce({
      candidates: [
        {
          isbn: '9780135957059',
          title: 'The Pragmatic Programmer',
          author: 'Andrew Hunt',
        },
      ],
      rawRecognition: { isbn: '9780135957059', confidence: 'high' },
    });

    renderScan();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['fake'], 'cover.jpg', { type: 'image/jpeg' })],
      writable: false,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText('The Pragmatic Programmer')).toBeInTheDocument();
    });
    expect(mocks.resolveCoverByIsbn).toHaveBeenCalledWith('9780135957059');
    expect(mocks.recognizeCover).not.toHaveBeenCalled();
  });

  it('uses the project library before external ISBN resolution', async () => {
    mocks.lookupLibraryByIsbn.mockResolvedValueOnce({
      isbn: '9780135957059',
      title: 'The Pragmatic Programmer',
      author: 'Andrew Hunt',
      coverUrl: null,
      summary: 'Local library copy',
    });
    scanIsbnMock.mockResolvedValue('9780135957059');

    renderScan();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['fake'], 'cover.jpg', { type: 'image/jpeg' })],
      writable: false,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText('已命中项目书库')).toBeInTheDocument();
    });
    expect(mocks.lookupLibraryByIsbn).toHaveBeenCalledWith('9780135957059');
    expect(mocks.resolveCoverByIsbn).not.toHaveBeenCalled();
  });

  it('falls back to cover recognition when barcode is not detected', async () => {
    scanIsbnMock.mockResolvedValue(null);
    mocks.recognizeCover.mockResolvedValueOnce({
      candidates: [
        {
          isbn: '9780135957059',
          title: 'The Pragmatic Programmer',
          author: 'Andrew Hunt',
        },
      ],
      rawRecognition: { title: 'The Pragmatic Programmer' },
    });

    renderScan();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['fake'], 'cover.jpg', { type: 'image/jpeg' })],
      writable: false,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText('The Pragmatic Programmer')).toBeInTheDocument();
    });
    expect(mocks.recognizeCover).toHaveBeenCalledTimes(1);
    expect(mocks.resolveCoverByIsbn).not.toHaveBeenCalled();
  });

  it('shows manual search candidates without navigation', async () => {
    mocks.searchCoverCandidates.mockResolvedValueOnce({
      candidates: [
        {
          isbn: '9780135957059',
          title: 'The Pragmatic Programmer',
          author: 'Andrew Hunt',
        },
      ],
      rawRecognition: { title: 'The Pragmatic Programmer' },
    });

    renderScan();

    const textField = screen.getByPlaceholderText('输入书名后回车搜索');
    fireEvent.change(textField, { target: { value: 'Pragmatic' } });
    fireEvent.click(screen.getByText('搜索'));

    await waitFor(() => {
      expect(screen.getByText('The Pragmatic Programmer')).toBeInTheDocument();
    });
    expect(mocks.searchCoverCandidates).toHaveBeenCalledWith('Pragmatic');
  });

  it('shows no results message after manual search returns empty', async () => {
    mocks.searchCoverCandidates.mockResolvedValueOnce({ candidates: [], rawRecognition: null });

    renderScan();

    const textField = screen.getByPlaceholderText('输入书名后回车搜索');
    fireEvent.change(textField, { target: { value: 'xyz-unknown' } });
    fireEvent.click(screen.getByText('搜索'));

    await waitFor(() => {
      expect(screen.getByText('未识别到匹配图书')).toBeInTheDocument();
    });
  });

  it('shows error message when manual search fails', async () => {
    mocks.searchCoverCandidates.mockRejectedValueOnce(new Error('network error'));

    renderScan();

    const textField = screen.getByPlaceholderText('输入书名后回车搜索');
    fireEvent.change(textField, { target: { value: 'Pragmatic' } });
    fireEvent.click(screen.getByText('搜索'));

    await waitFor(() => {
      expect(screen.getByText('手动搜索失败，请稍后重试')).toBeInTheDocument();
    });
  });

  it('shows recent scan history on render', () => {
    scanHistoryMock.getScanHistory.mockReturnValue([
      {
        isbn: '9780135957059',
        title: 'The Pragmatic Programmer',
        author: 'Andrew Hunt',
        scannedAt: '2024-01-01',
      },
    ]);

    renderScan();

    expect(screen.getByText('最近识别')).toBeInTheDocument();
    expect(screen.getByText('The Pragmatic Programmer')).toBeInTheDocument();
    expect(screen.getByText('清空历史')).toBeInTheDocument();
  });

  it('saves first candidate to history after successful recognition', async () => {
    mocks.recognizeCover.mockResolvedValueOnce({
      candidates: [
        {
          isbn: '9780135957059',
          title: 'The Pragmatic Programmer',
          author: 'Andrew Hunt',
        },
      ],
      rawRecognition: { title: 'The Pragmatic Programmer', author: 'Andrew Hunt' },
    });

    renderScan();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['fake'], 'cover.jpg', { type: 'image/jpeg' })],
      writable: false,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText('The Pragmatic Programmer')).toBeInTheDocument();
    });
    expect(scanHistoryMock.addScanHistory).toHaveBeenCalledWith(
      expect.objectContaining({ isbn: '9780135957059', title: 'The Pragmatic Programmer' }),
    );
  });

  it('clears history when clear button clicked', () => {
    scanHistoryMock.getScanHistory.mockReturnValue([
      {
        isbn: '9780135957059',
        title: 'The Pragmatic Programmer',
        author: 'Andrew Hunt',
        scannedAt: '2024-01-01',
      },
    ]);

    renderScan();

    fireEvent.click(screen.getByText('清空历史'));
    expect(scanHistoryMock.clearScanHistory).toHaveBeenCalled();
  });

  it('starts live scanning and navigates directly after an ISBN match', async () => {
    let onDetected: ((isbn: string) => void) | undefined;
    const controls = { stop: vi.fn() };
    startVideoScanMock.mockImplementationOnce(
      (_video: HTMLVideoElement, callback: (isbn: string) => void) => {
        onDetected = callback;
        return Promise.resolve(controls);
      },
    );
    mocks.resolveCoverByIsbn.mockResolvedValueOnce({
      candidates: [
        {
          isbn: '9780135957059',
          title: 'The Pragmatic Programmer',
          author: 'Andrew Hunt',
        },
      ],
      rawRecognition: { isbn: '9780135957059', confidence: 'high' },
    });

    renderScan();
    fireEvent.click(screen.getByText('实时扫码'));

    await waitFor(() => expect(startVideoScanMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('停止扫码')).toBeInTheDocument();

    act(() => onDetected?.('9780135957059'));

    await waitFor(() => expect(screen.getByText('book detail page')).toBeInTheDocument());
    expect(controls.stop).toHaveBeenCalledTimes(1);
    expect(mocks.resolveCoverByIsbn).toHaveBeenCalledWith('9780135957059');
    expect(scanHistoryMock.addScanHistory).toHaveBeenCalledWith(
      expect.objectContaining({ isbn: '9780135957059' }),
    );
  });

  it('shows a recoverable error when the camera cannot start', async () => {
    startVideoScanMock.mockRejectedValueOnce(new Error('permission denied'));

    renderScan();
    fireEvent.click(screen.getByText('实时扫码'));

    await waitFor(() => {
      expect(screen.getByText('无法使用摄像头，请检查权限或改用拍照识别')).toBeInTheDocument();
    });
    expect(screen.getByText('拍照 / 上传封面')).toBeEnabled();
    expect(screen.getByPlaceholderText('输入书名后回车搜索')).toBeEnabled();
  });

  it('stops the camera when the page unmounts', async () => {
    const controls = { stop: vi.fn() };
    startVideoScanMock.mockResolvedValueOnce(controls);

    const view = renderScan();
    fireEvent.click(screen.getByText('实时扫码'));
    await waitFor(() => expect(screen.getByText('停止扫码')).toBeInTheDocument());

    view.unmount();
    expect(controls.stop).toHaveBeenCalledTimes(1);
  });
});
