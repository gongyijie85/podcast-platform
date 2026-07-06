import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDetail: vi.fn(),
  generatePitch: vi.fn(),
  updatePitch: vi.fn(),
}));

vi.mock('@/api/book.api', () => ({
  bookApi: {
    getDetail: mocks.getDetail,
    generatePitch: mocks.generatePitch,
    updatePitch: mocks.updatePitch,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'bookDetail.title': '主播口播稿',
        'bookDetail.generate': 'AI 生成',
        'bookDetail.save': '保存',
        'bookDetail.generating': '生成中...',
        'bookDetail.saving': '保存中...',
        'bookDetail.generatedAt': `生成时间：${opts?.time ?? ''}`,
        'bookDetail.notFound': '图书未找到',
        'bookDetail.back': '← 返回选书库',
      };
      return map[key] ?? key;
    },
  }),
}));

import { BookDetail } from '@/pages/BookDetail';
import type { BookLibraryItem } from '@shared/book';

const now = '2026-07-01T08:00:00.000Z';

function makeBook(overrides: Partial<BookLibraryItem> = {}): BookLibraryItem {
  return {
    isbn: '9787544291170',
    title: '解忧杂货店',
    author: '东野圭吾',
    coverUrl: 'https://example.com/cover.jpg',
    summary: '中文简介内容',
    publisher: '南海出版公司',
    publishedDate: '2014-05',
    pageCount: 291,
    source: 'googlebooks',
    metadataSyncStatus: 'synced',
    metadataSyncAttempts: 1,
    metadataSyncedAt: now,
    metadataSyncError: null,
    livePitch: '已有的口播稿',
    livePitchGeneratedAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    queryCount: 5,
    ...overrides,
  } as BookLibraryItem;
}

function renderDetail(isbn = '9787544291170') {
  return render(
    <MemoryRouter initialEntries={[`/books/${isbn}`]}>
      <Routes>
        <Route path="/books/:isbn" element={<BookDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BookDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('renders book detail and live pitch editor', async () => {
    mocks.getDetail.mockResolvedValueOnce(makeBook());

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('解忧杂货店')).toBeInTheDocument();
    });
    expect(screen.getByText('东野圭吾')).toBeInTheDocument();
    expect(screen.getByText(/ISBN：9787544291170/)).toBeInTheDocument();
    expect(screen.getByText('主播口播稿')).toBeInTheDocument();
    expect(screen.getByDisplayValue('已有的口播稿')).toBeInTheDocument();
    expect(screen.getByText('AI 生成')).toBeInTheDocument();
    expect(screen.getByText('保存')).toBeInTheDocument();

    const basicInfo = screen.getByLabelText('基本信息');
    const livePitch = screen.getByLabelText('主播口播稿');
    const summary = screen.getByLabelText('图书简介');
    expect(
      basicInfo.compareDocumentPosition(livePitch) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      livePitch.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('generates live pitch on button click', async () => {
    mocks.getDetail.mockResolvedValueOnce(makeBook({ livePitch: '' }));
    mocks.generatePitch.mockResolvedValueOnce({
      isbn: '9787544291170',
      livePitch: 'AI 生成的全新口播稿',
      generatedAt: now,
    });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('AI 生成')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('AI 生成'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('AI 生成的全新口播稿')).toBeInTheDocument();
    });
    expect(mocks.generatePitch).toHaveBeenCalledWith('9787544291170');
  });

  it('saves live pitch on button click', async () => {
    mocks.getDetail.mockResolvedValueOnce(makeBook());
    mocks.updatePitch.mockResolvedValueOnce(
      makeBook({ livePitch: '编辑后的口播稿' }),
    );

    renderDetail();

    await waitFor(() => {
      expect(screen.getByDisplayValue('已有的口播稿')).toBeInTheDocument();
    });

    const textarea = screen.getByDisplayValue('已有的口播稿') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '编辑后的口播稿' } });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(mocks.updatePitch).toHaveBeenCalledWith('9787544291170', '编辑后的口播稿');
    });
    expect(window.alert).toHaveBeenCalledWith('口播稿已保存');
  });
});
