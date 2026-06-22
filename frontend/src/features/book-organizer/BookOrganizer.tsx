import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Pagination,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslation } from 'react-i18next';
import { BookSearchBar } from '../../components/book/BookSearchBar';
import { BookCard } from '../../components/book/BookCard';
import { Empty } from '../../components/common/Empty';
import { Loading } from '../../components/common/Loading';
import { bookApi } from '../../api/book.api';
import { useUiStore } from '../../store/ui.store';
import { normalizeIsbn } from '../../utils/isbn';
import type { BookLibraryItem, BookMetadata, BookRankImportPayload } from '@shared/book';

const PAGE_SIZE = 10;
const LIBRARY_MAX_ATTEMPTS = 2;
const LIBRARY_IMPORT_MAX_ISBNS = 200;
const RESOLVE_BATCH_SIZE = 20;

const BOOKRANK_CATEGORIES = [
  { value: 'hardcover-fiction', label: '精装小说' },
  { value: 'hardcover-nonfiction', label: '精装非虚构' },
  { value: 'combined-print-and-e-book-fiction', label: '综合小说' },
  { value: 'combined-print-and-e-book-nonfiction', label: '综合非虚构' },
  { value: 'business-books', label: '商业图书' },
  { value: 'advice-how-to-and-miscellaneous', label: '建议/方法' },
];

type ViewMode = 'library' | 'search';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '未知错误';
};

const isTransientLibraryError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase();
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toLowerCase()
      : '';
  return (
    code === 'econnaborted' ||
    message.includes('timeout') ||
    message.includes('network error') ||
    message.includes('connection') ||
    message.includes('fetch failed') ||
    message.includes('application loading')
  );
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const normalizeUniqueIsbns = (
  isbns: string[],
): { normalized: string[]; duplicateCount: number; overflowCount: number } => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const isbn of isbns) {
    const value = normalizeIsbn(isbn) ?? isbn.replace(/[-\s]/g, '').trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return {
    normalized: normalized.slice(0, LIBRARY_IMPORT_MAX_ISBNS),
    duplicateCount: isbns.length - normalized.length,
    overflowCount: Math.max(0, normalized.length - LIBRARY_IMPORT_MAX_ISBNS),
  };
};

interface BookOrganizerProps {
  initialIsbns?: string[];
  onUseBook: (book: BookMetadata) => void;
  onUseBooks?: (books: BookMetadata[]) => void;
}

export function BookOrganizer({
  initialIsbns = [],
  onUseBook,
  onUseBooks,
}: BookOrganizerProps): JSX.Element {
  const { t } = useTranslation();
  const push = useUiStore((s) => s.push);
  const [view, setView] = useState<ViewMode>('library');

  const [libraryItems, setLibraryItems] = useState<BookLibraryItem[]>([]);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [libraryPage, setLibraryPage] = useState(1);
  const [librarySearchText, setLibrarySearchText] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [librarySource, setLibrarySource] = useState('');
  const [libraryCategory, setLibraryCategory] = useState('');
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryLoadingLabel, setLibraryLoadingLabel] = useState('正在加载图书陈列库');
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryNotice, setLibraryNotice] = useState<string | null>(null);

  const [results, setResults] = useState<BookMetadata[]>([]);
  const [failed, setFailed] = useState<Array<{ isbn: string; reason: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoadingLabel, setSearchLoadingLabel] = useState('正在整理图书信息');
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchPage, setSearchPage] = useState(1);
  const [filterText, setFilterText] = useState('');

  const [selectedBooks, setSelectedBooks] = useState<Map<string, BookMetadata>>(() => new Map());
  const [importKind, setImportKind] = useState<BookRankImportPayload['kind']>('bestsellers');
  const [importCategory, setImportCategory] = useState('hardcover-fiction');
  const [importLimit, setImportLimit] = useState(20);
  const [importing, setImporting] = useState(false);

  const selectedList = useMemo(() => Array.from(selectedBooks.values()), [selectedBooks]);

  const loadLibrary = useCallback(
    async (pageOverride?: number): Promise<void> => {
      const page = pageOverride ?? libraryPage;
      setLibraryLoading(true);
      setLibraryError(null);
      setLibraryNotice(null);
      try {
        for (let attempt = 1; attempt <= LIBRARY_MAX_ATTEMPTS; attempt += 1) {
          setLibraryLoadingLabel(
            attempt === 1 ? '正在加载图书陈列库' : '后端冷启动中，正在重试图书陈列库',
          );
          try {
            const response = await bookApi.listLibrary({
              page,
              pageSize: PAGE_SIZE,
              q: libraryQuery || undefined,
              source: librarySource || undefined,
              category: libraryCategory || undefined,
            });
            setLibraryItems(response.items);
            setLibraryTotal(response.total);
            setLibraryPage(response.page);
            if (attempt > 1) {
              setLibraryNotice('后端服务已唤醒，图书陈列库已恢复。');
            }
            return;
          } catch (e) {
            const message = getErrorMessage(e);
            if (attempt < LIBRARY_MAX_ATTEMPTS && isTransientLibraryError(e)) {
              setLibraryNotice('后端服务可能刚从休眠中唤醒，正在自动重试。');
              continue;
            }
            setLibraryError(`图书陈列库加载失败：${message}`);
            return;
          }
        }
      } finally {
        setLibraryLoading(false);
        setLibraryLoadingLabel('正在加载图书陈列库');
      }
    },
    [libraryCategory, libraryPage, libraryQuery, librarySource],
  );

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (initialIsbns.length > 0) {
      void handleSearch(initialIsbns);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSearchPage(1);
  }, [filterText, results]);

  const filteredResults = useMemo(() => {
    const keyword = filterText.trim().toLowerCase();
    if (!keyword) return results;
    return results.filter((book) => {
      const haystack = [
        book.title,
        book.author,
        book.isbn,
        book.summary,
        book.publisher,
        book.publishedDate,
        book.source,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [filterText, results]);

  const searchTotalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const visibleSearchResults = useMemo(() => {
    const start = (searchPage - 1) * PAGE_SIZE;
    return filteredResults.slice(start, start + PAGE_SIZE);
  }, [filteredResults, searchPage]);

  const activeItems: BookMetadata[] = view === 'library' ? libraryItems : visibleSearchResults;
  const selectedOnPage = activeItems.filter((book) => selectedBooks.has(book.isbn)).length;
  const allVisibleSelected = activeItems.length > 0 && selectedOnPage === activeItems.length;
  const libraryTotalPages = Math.max(1, Math.ceil(libraryTotal / PAGE_SIZE));

  const handleSearch = async (isbns: string[]): Promise<void> => {
    const { normalized, duplicateCount, overflowCount } = normalizeUniqueIsbns(isbns);

    if (normalized.length === 0) return;

    setLoading(true);
    setSearchLoadingLabel(
      normalized.length > RESOLVE_BATCH_SIZE
        ? `准备分批整理 ${normalized.length} 本书`
        : '正在整理图书信息',
    );
    setSearchNotice(null);
    setSearched(true);
    setError(null);
    setFailed([]);
    setSearchPage(1);
    setFilterText('');
    setView('search');

    try {
      const batches = chunk(normalized, RESOLVE_BATCH_SIZE);
      const aggregatedItems = new Map<string, BookMetadata>();
      const aggregatedFailed: Array<{ isbn: string; reason: string }> = [];

      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const processedBefore = index * RESOLVE_BATCH_SIZE;
        setSearchLoadingLabel(
          batches.length === 1
            ? '正在整理图书信息'
            : `正在整理第 ${index + 1}/${batches.length} 批 · ${processedBefore}/${normalized.length} 本`,
        );

        const response = await bookApi.resolveMetadata(batch);
        for (const item of response.items) {
          aggregatedItems.set(item.isbn, item);
        }
        aggregatedFailed.push(...response.failed);

        setResults(Array.from(aggregatedItems.values()));
        setFailed([...aggregatedFailed]);
      }

      const items = Array.from(aggregatedItems.values());
      setResults(items);
      setFailed(aggregatedFailed);
      void loadLibrary(1);

      const notices = [
        duplicateCount > 0 ? `已自动去重 ${duplicateCount} 个重复 ISBN` : null,
        overflowCount > 0
          ? `本次最多导入 ${LIBRARY_IMPORT_MAX_ISBNS} 本，已忽略 ${overflowCount} 个超出项`
          : null,
      ].filter(Boolean);
      setSearchNotice(notices.length > 0 ? notices.join('；') : null);

      if (items.length === 0) {
        push(t('bookSearch.noResults'), 'info');
      } else {
        push(`已整理 ${items.length} 本书，并写入图书陈列库`, 'success');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      setResults([]);
      setError(`图书信息获取失败：${message}`);
      push('图书信息获取失败', 'error');
    } finally {
      setLoading(false);
      setSearchLoadingLabel('正在整理图书信息');
    }
  };

  const importFromBookRank = async (): Promise<void> => {
    setImporting(true);
    setLibraryError(null);
    try {
      const response = await bookApi.importBookRank({
        kind: importKind,
        category: importKind === 'bestsellers' ? importCategory : undefined,
        limit: importLimit,
      });
      setView('library');
      setLibraryPage(1);
      await loadLibrary(1);
      push(`已从 BookRank 导入 ${response.imported} 本书`, 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      setLibraryError(`BookRank 导入失败：${message}`);
      push('BookRank 导入失败', 'error');
    } finally {
      setImporting(false);
    }
  };

  const clearResults = (): void => {
    setResults([]);
    setFailed([]);
    setError(null);
    setSearchNotice(null);
    setSearched(false);
    setSearchPage(1);
    setFilterText('');
  };

  const applyLibraryFilters = (): void => {
    setView('library');
    setLibraryPage(1);
    setLibraryQuery(librarySearchText.trim());
  };

  const clearLibraryFilters = (): void => {
    setLibrarySearchText('');
    setLibraryQuery('');
    setLibrarySource('');
    setLibraryCategory('');
    setLibraryPage(1);
    setView('library');
  };

  const toggleBookSelection = (book: BookMetadata): void => {
    setSelectedBooks((current) => {
      const next = new Map(current);
      if (next.has(book.isbn)) next.delete(book.isbn);
      else next.set(book.isbn, book);
      return next;
    });
  };

  const toggleVisibleSelection = (): void => {
    setSelectedBooks((current) => {
      const next = new Map(current);
      for (const book of activeItems) {
        if (allVisibleSelected) next.delete(book.isbn);
        else next.set(book.isbn, book);
      }
      return next;
    });
  };

  const useSelectedBooks = (): void => {
    if (selectedList.length === 0) return;
    onUseBooks?.(selectedList);
  };

  const libraryStart = libraryTotal === 0 ? 0 : (libraryPage - 1) * PAGE_SIZE + 1;
  const libraryEnd = Math.min(libraryPage * PAGE_SIZE, libraryTotal);
  const searchStart = filteredResults.length === 0 ? 0 : (searchPage - 1) * PAGE_SIZE + 1;
  const searchEnd = Math.min(searchPage * PAGE_SIZE, filteredResults.length);
  const metrics = [
    { label: '陈列', value: libraryTotal, icon: <LibraryBooksIcon fontSize="small" /> },
    { label: '本次搜索', value: results.length, icon: <AutoStoriesIcon fontSize="small" /> },
    { label: '已选', value: selectedList.length, icon: <PlaylistAddCheckIcon fontSize="small" /> },
    { label: '失败', value: failed.length, icon: <ReportProblemOutlinedIcon fontSize="small" /> },
  ];

  return (
    <Box sx={{ maxWidth: 1220, mx: 'auto' }}>
      <Stack spacing={2.5}>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2, md: 3 },
            borderRadius: 1,
            position: 'relative',
            overflow: 'hidden',
            bgcolor: '#ffffff',
            borderColor: 'rgba(99, 102, 241, 0.18)',
            boxShadow: '0 16px 46px rgba(15, 23, 42, 0.06)',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: 5,
              bgcolor: 'primary.main',
            },
          }}
        >
          <Stack spacing={2}>
            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              spacing={2.5}
              justifyContent="space-between"
            >
              <Box sx={{ minWidth: 0, maxWidth: 620 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 1,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: '#eef2ff',
                      color: 'primary.main',
                    }}
                  >
                    <AutoStoriesIcon fontSize="small" />
                  </Box>
                  <Typography
                    variant="h4"
                    fontWeight={800}
                    sx={{ fontSize: { xs: 24, md: 30 }, letterSpacing: 0 }}
                  >
                    图书陈列库
                  </Typography>
                </Stack>
                <Typography color="text.secondary">
                  历史查询、BookRank 导入和项目用书汇总到这里，先选书，再进入播客生成。
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'repeat(2, minmax(0, 1fr))',
                    sm: 'repeat(4, minmax(92px, 1fr))',
                  },
                  gap: 1,
                  minWidth: { lg: 440 },
                }}
              >
                {metrics.map((item) => {
                  const active = item.label === '已选' && selectedList.length > 0;
                  const warning = item.label === '失败' && failed.length > 0;
                  return (
                    <Box
                      key={item.label}
                      sx={{
                        p: 1.25,
                        border: 1,
                        borderColor: active ? 'primary.main' : warning ? 'warning.main' : 'divider',
                        borderRadius: 1,
                        bgcolor: active
                          ? 'rgba(99, 102, 241, 0.08)'
                          : warning
                            ? 'rgba(245, 158, 11, 0.08)'
                            : '#f8fafc',
                        minHeight: 74,
                      }}
                    >
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={0.75}
                        color="text.secondary"
                      >
                        {item.icon}
                        <Typography variant="caption" fontWeight={700}>
                          {item.label}
                        </Typography>
                      </Stack>
                      <Typography variant="h5" fontWeight={800} sx={{ mt: 0.25, letterSpacing: 0 }}>
                        {item.value}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Stack>

            <ToggleButtonGroup
              exclusive
              size="small"
              value={view}
              onChange={(_, value) => value && setView(value)}
              aria-label="book organizer view"
              sx={{
                alignSelf: 'flex-start',
                p: 0.5,
                bgcolor: '#f1f5f9',
                borderRadius: 1,
                '& .MuiToggleButton-root': {
                  border: 0,
                  borderRadius: 1,
                  px: 2,
                  '&.Mui-selected': {
                    bgcolor: 'background.paper',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.10)',
                  },
                },
              }}
            >
              <ToggleButton value="library">公共陈列库</ToggleButton>
              <ToggleButton value="search">本次 ISBN 搜索</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 1 }}>
          <Stack spacing={2}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.25fr) minmax(360px, 0.75fr)' },
                gap: 2,
                alignItems: 'stretch',
              }}
            >
              <Box
                sx={{
                  p: 1.5,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: '#fbfdff',
                }}
              >
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.25 }}>
                  筛选陈列
                </Typography>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={1.25}
                  alignItems={{ md: 'center' }}
                >
                  <TextField
                    size="small"
                    value={librarySearchText}
                    onChange={(event) => setLibrarySearchText(event.target.value)}
                    placeholder="书名、作者、ISBN、简介"
                    inputProps={{ 'aria-label': 'filter library books' }}
                    InputProps={{
                      startAdornment: <SearchIcon fontSize="small" color="action" sx={{ mr: 1 }} />,
                    }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    select
                    size="small"
                    label="来源"
                    value={librarySource}
                    onChange={(event) => setLibrarySource(event.target.value)}
                    SelectProps={{ native: true }}
                    sx={{ minWidth: 140 }}
                  >
                    <option value="">全部来源</option>
                    <option value="bookrank">BookRank</option>
                    <option value="openlibrary">Open Library</option>
                    <option value="googlebooks">Google Books</option>
                    <option value="mock">Mock</option>
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="分类"
                    value={libraryCategory}
                    onChange={(event) => setLibraryCategory(event.target.value)}
                    SelectProps={{ native: true }}
                    sx={{ minWidth: 160 }}
                  >
                    <option value="">全部分类</option>
                    <option value="new-books">新书</option>
                    {BOOKRANK_CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </TextField>
                  <Button
                    startIcon={<SearchIcon />}
                    variant="contained"
                    onClick={applyLibraryFilters}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    筛选
                  </Button>
                  <Button onClick={clearLibraryFilters} sx={{ whiteSpace: 'nowrap' }}>
                    清空
                  </Button>
                  <Button
                    startIcon={<RefreshIcon />}
                    onClick={() => void loadLibrary()}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    刷新
                  </Button>
                </Stack>
              </Box>

              <Box
                sx={{
                  p: 1.5,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: '#f8fafc',
                }}
              >
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.25 }}>
                  BookRank 导入
                </Typography>
                <Stack direction={{ xs: 'column', md: 'row', lg: 'column' }} spacing={1.25}>
                  <Stack direction={{ xs: 'column', sm: 'row', lg: 'column' }} spacing={1.25}>
                    <TextField
                      select
                      size="small"
                      label="导入类型"
                      value={importKind}
                      onChange={(event) =>
                        setImportKind(event.target.value as BookRankImportPayload['kind'])
                      }
                      SelectProps={{ native: true }}
                      sx={{ minWidth: 150 }}
                    >
                      <option value="bestsellers">畅销榜</option>
                      <option value="new-books">新书</option>
                    </TextField>
                    {importKind === 'bestsellers' && (
                      <TextField
                        select
                        size="small"
                        label="榜单分类"
                        value={importCategory}
                        onChange={(event) => setImportCategory(event.target.value)}
                        SelectProps={{ native: true }}
                        sx={{ minWidth: 190 }}
                      >
                        {BOOKRANK_CATEGORIES.map((category) => (
                          <option key={category.value} value={category.value}>
                            {category.label}
                          </option>
                        ))}
                      </TextField>
                    )}
                    <TextField
                      select
                      size="small"
                      label="数量"
                      value={importLimit}
                      onChange={(event) => setImportLimit(Number(event.target.value))}
                      SelectProps={{ native: true }}
                      sx={{ minWidth: 110 }}
                    >
                      {[10, 20, 30, 50].map((value) => (
                        <option key={value} value={value}>
                          {value} 本
                        </option>
                      ))}
                    </TextField>
                  </Stack>
                  <Button
                    variant="contained"
                    startIcon={<LibraryBooksIcon />}
                    onClick={() => void importFromBookRank()}
                    disabled={importing}
                    sx={{
                      whiteSpace: 'nowrap',
                      alignSelf: { xs: 'stretch', md: 'flex-start', lg: 'stretch' },
                    }}
                  >
                    {importing ? '导入中' : '导入到陈列库'}
                  </Button>
                </Stack>
              </Box>
            </Box>

            <Divider />

            <Box
              sx={{
                p: 1.5,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.paper',
              }}
            >
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                批量 ISBN 搜索
              </Typography>
              <BookSearchBar
                maxIsbns={LIBRARY_IMPORT_MAX_ISBNS}
                onSearch={(isbns) => void handleSearch(isbns)}
              />
            </Box>
          </Stack>
        </Paper>

        {libraryNotice && (
          <Alert severity="info" onClose={() => setLibraryNotice(null)}>
            {libraryNotice}
          </Alert>
        )}

        {searchNotice && (
          <Alert severity="info" onClose={() => setSearchNotice(null)}>
            {searchNotice}
          </Alert>
        )}

        {(error || libraryError) && (
          <Alert
            severity="error"
            onClose={() => {
              setError(null);
              setLibraryError(null);
            }}
          >
            {error || libraryError}
          </Alert>
        )}

        {failed.length > 0 && (
          <Alert severity="warning">
            未获取到 {failed.length} 本书：{failed.map((item) => item.isbn).join('、')}
          </Alert>
        )}

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 1, minHeight: 420 }}>
          {view === 'library' ? (
            libraryLoading ? (
              <Loading fullScreen label={libraryLoadingLabel} />
            ) : libraryItems.length === 0 ? (
              <Empty
                title="陈列库暂无图书"
                description="可以先批量搜索 ISBN，或从 BookRank 导入畅销榜图书"
              />
            ) : (
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  alignItems={{ md: 'center' }}
                  justifyContent="space-between"
                  spacing={1.5}
                >
                  <Box>
                    <Typography variant="h6" fontWeight={700}>
                      公共陈列库 · 共 {libraryTotal} 本 · 第 {libraryPage}/{libraryTotalPages} 页
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      当前显示 {libraryStart}-{libraryEnd}，卡片包含书名、作者和真实图书简介。
                    </Typography>
                  </Box>
                </Stack>
                {renderSelectionBar()}
                <Stack spacing={1.5}>
                  {libraryItems.map((book, index) => (
                    <BookCard
                      key={`${book.isbn}-${book.lastSeenAt}`}
                      book={book}
                      layout="list"
                      index={(libraryPage - 1) * PAGE_SIZE + index + 1}
                      selectable
                      checked={selectedBooks.has(book.isbn)}
                      onToggleSelect={toggleBookSelection}
                      onUse={onUseBook}
                    />
                  ))}
                </Stack>
                {libraryTotal > PAGE_SIZE && (
                  <Stack alignItems="center" sx={{ pt: 0.5 }}>
                    <Pagination
                      count={libraryTotalPages}
                      page={libraryPage}
                      onChange={(_, value) => setLibraryPage(value)}
                      color="primary"
                      shape="rounded"
                    />
                  </Stack>
                )}
              </Stack>
            )
          ) : loading ? (
            <Loading fullScreen label={searchLoadingLabel || t('book.fetching')} />
          ) : results.length === 0 && searched ? (
            <Empty
              title={t('bookSearch.noResults')}
              description="请检查 ISBN，或稍后重试图书信息服务"
            />
          ) : results.length === 0 ? (
            <Empty
              title="输入 ISBN 开始整理"
              description="可一次粘贴最多 200 个 ISBN；系统会按 20 本一批整理并写入图书陈列库"
            />
          ) : (
            <Stack spacing={2}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                alignItems={{ md: 'center' }}
                justifyContent="space-between"
                spacing={1.5}
              >
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    本次搜索 · 共 {results.length} 本
                    {filteredResults.length !== results.length
                      ? ` · 匹配 ${filteredResults.length} 本`
                      : ''}
                    {filteredResults.length > PAGE_SIZE
                      ? ` · 第 ${searchPage}/${searchTotalPages} 页`
                      : ''}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    当前显示 {searchStart}-{searchEnd}，卡片包含书名、作者和真实图书简介。
                  </Typography>
                </Box>

                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  alignItems={{ sm: 'center' }}
                >
                  <TextField
                    size="small"
                    value={filterText}
                    onChange={(event) => setFilterText(event.target.value)}
                    placeholder="在本次结果中筛选"
                    inputProps={{ 'aria-label': 'filter books' }}
                    InputProps={{
                      startAdornment: <SearchIcon fontSize="small" color="action" sx={{ mr: 1 }} />,
                    }}
                    sx={{ minWidth: { xs: '100%', sm: 260 } }}
                  />
                  <Button size="small" onClick={clearResults} sx={{ whiteSpace: 'nowrap' }}>
                    清空结果
                  </Button>
                </Stack>
              </Stack>

              {renderSelectionBar()}

              {filteredResults.length === 0 ? (
                <Empty title="没有匹配的书" description="换一个关键词，或清空筛选条件" />
              ) : (
                <Stack spacing={1.5}>
                  {visibleSearchResults.map((book, index) => (
                    <BookCard
                      key={`${book.isbn}-${book.source}`}
                      book={book}
                      layout="list"
                      index={(searchPage - 1) * PAGE_SIZE + index + 1}
                      selectable
                      checked={selectedBooks.has(book.isbn)}
                      onToggleSelect={toggleBookSelection}
                      onUse={onUseBook}
                    />
                  ))}
                </Stack>
              )}

              {filteredResults.length > PAGE_SIZE && (
                <Stack alignItems="center" sx={{ pt: 0.5 }}>
                  <Pagination
                    count={searchTotalPages}
                    page={searchPage}
                    onChange={(_, value) => setSearchPage(value)}
                    color="primary"
                    shape="rounded"
                  />
                </Stack>
              )}
            </Stack>
          )}
        </Paper>
      </Stack>
    </Box>
  );

  function renderSelectionBar(): JSX.Element {
    return (
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        alignItems={{ md: 'center' }}
        justifyContent="space-between"
        sx={{
          p: 1.25,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'action.hover',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          已选 {selectedList.length} 本，用于确定本期播客内容。
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            size="small"
            variant="outlined"
            onClick={toggleVisibleSelection}
            disabled={activeItems.length === 0}
          >
            {allVisibleSelected ? '取消本页' : '选中本页'}
          </Button>
          <Button
            size="small"
            onClick={() => setSelectedBooks(new Map())}
            disabled={selectedList.length === 0}
          >
            清空选择
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<PlaylistAddCheckIcon />}
            onClick={useSelectedBooks}
            disabled={selectedList.length === 0}
            sx={{ whiteSpace: 'nowrap' }}
          >
            用选中书籍创建播客
          </Button>
        </Stack>
      </Stack>
    );
  }
}
