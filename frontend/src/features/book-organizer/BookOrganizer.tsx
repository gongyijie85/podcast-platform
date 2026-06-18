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

const BOOKRANK_CATEGORIES = [
  { value: 'hardcover-fiction', label: '精装小说' },
  { value: 'hardcover-nonfiction', label: '精装非虚构' },
  { value: 'combined-print-and-e-book-fiction', label: '综合小说' },
  { value: 'combined-print-and-e-book-nonfiction', label: '综合非虚构' },
  { value: 'business-books', label: '商业图书' },
  { value: 'advice-how-to-and-miscellaneous', label: '建议/方法' },
];

type ViewMode = 'library' | 'search';

interface BookOrganizerProps {
  initialIsbns?: string[];
  onUseBook: (book: BookMetadata) => void;
  onUseBooks?: (books: BookMetadata[]) => void;
}

export function BookOrganizer({ initialIsbns = [], onUseBook, onUseBooks }: BookOrganizerProps): JSX.Element {
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
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const [results, setResults] = useState<BookMetadata[]>([]);
  const [failed, setFailed] = useState<Array<{ isbn: string; reason: string }>>([]);
  const [loading, setLoading] = useState(false);
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
      } catch (e) {
        const message = e instanceof Error ? e.message : '未知错误';
        setLibraryError(`图书陈列库加载失败：${message}`);
      } finally {
        setLibraryLoading(false);
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
    const normalized = isbns
      .map((isbn) => normalizeIsbn(isbn) ?? isbn.trim())
      .filter(Boolean)
      .slice(0, 20);

    if (normalized.length === 0) return;

    setLoading(true);
    setSearched(true);
    setError(null);
    setFailed([]);
    setSearchPage(1);
    setFilterText('');
    setView('search');

    try {
      const response = await bookApi.resolveMetadata(normalized);
      setResults(response.items);
      setFailed(response.failed);
      void loadLibrary(1);

      if (response.items.length === 0) {
        push(t('bookSearch.noResults'), 'info');
      } else {
        push(`已整理 ${response.items.length} 本书，并写入图书陈列库`, 'success');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      setResults([]);
      setError(`图书信息获取失败：${message}`);
      push('图书信息获取失败', 'error');
    } finally {
      setLoading(false);
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

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
      <Stack spacing={2.5}>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2, md: 3 },
            borderRadius: 1,
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              bgcolor: 'primary.main',
            },
          }}
        >
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <AutoStoriesIcon color="primary" />
                  <Typography variant="h4" fontWeight={800} sx={{ fontSize: { xs: 24, md: 30 } }}>
                    图书陈列库
                  </Typography>
                </Stack>
                <Typography color="text.secondary">
                  全站共享书库：沉淀历史查询、项目用书和 BookRank 导入图书，每页 10 本，可批量勾选生成播客。
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Chip icon={<LibraryBooksIcon />} label={`陈列 ${libraryTotal}`} variant="outlined" />
                <Chip label={`本次搜索 ${results.length}`} variant="outlined" />
                <Chip
                  icon={<PlaylistAddCheckIcon />}
                  label={`已选 ${selectedList.length}`}
                  color={selectedList.length > 0 ? 'primary' : 'default'}
                  variant="outlined"
                />
                <Chip
                  icon={<ReportProblemOutlinedIcon />}
                  label={`失败 ${failed.length}`}
                  color={failed.length > 0 ? 'warning' : 'default'}
                  variant="outlined"
                />
              </Stack>
            </Stack>

            <ToggleButtonGroup
              exclusive
              size="small"
              value={view}
              onChange={(_, value) => value && setView(value)}
              aria-label="book organizer view"
            >
              <ToggleButton value="library">公共陈列库</ToggleButton>
              <ToggleButton value="search">本次 ISBN 搜索</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 1 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
              <TextField
                size="small"
                value={librarySearchText}
                onChange={(event) => setLibrarySearchText(event.target.value)}
                placeholder="筛选书名、作者、ISBN、简介"
                inputProps={{ 'aria-label': 'filter library books' }}
                InputProps={{ startAdornment: <SearchIcon fontSize="small" color="action" sx={{ mr: 1 }} /> }}
                sx={{ flex: 1 }}
              />
              <TextField
                select
                size="small"
                label="来源"
                value={librarySource}
                onChange={(event) => setLibrarySource(event.target.value)}
                SelectProps={{ native: true }}
                sx={{ minWidth: 150 }}
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
                sx={{ minWidth: 170 }}
              >
                <option value="">全部分类</option>
                <option value="new-books">新书</option>
                {BOOKRANK_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </TextField>
              <Button variant="contained" onClick={applyLibraryFilters} sx={{ whiteSpace: 'nowrap' }}>
                筛选
              </Button>
              <Button onClick={clearLibraryFilters} sx={{ whiteSpace: 'nowrap' }}>
                清空
              </Button>
              <Button startIcon={<RefreshIcon />} onClick={() => void loadLibrary()} sx={{ whiteSpace: 'nowrap' }}>
                刷新
              </Button>
            </Stack>

            <Divider />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
              <Chip icon={<LibraryBooksIcon />} label="BookRank 导入" variant="outlined" sx={{ alignSelf: { xs: 'flex-start', md: 'center' } }} />
              <TextField
                select
                size="small"
                label="导入类型"
                value={importKind}
                onChange={(event) => setImportKind(event.target.value as BookRankImportPayload['kind'])}
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
              <Button
                variant="contained"
                startIcon={<LibraryBooksIcon />}
                onClick={() => void importFromBookRank()}
                disabled={importing}
                sx={{ whiteSpace: 'nowrap' }}
              >
                {importing ? '导入中' : '导入到陈列库'}
              </Button>
            </Stack>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 1 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            批量 ISBN 搜索
          </Typography>
          <BookSearchBar onSearch={(isbns) => void handleSearch(isbns)} />
        </Paper>

        {(error || libraryError) && (
          <Alert severity="error" onClose={() => { setError(null); setLibraryError(null); }}>
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
              <Loading fullScreen label="正在加载图书陈列库" />
            ) : libraryItems.length === 0 ? (
              <Empty title="陈列库暂无图书" description="可以先批量搜索 ISBN，或从 BookRank 导入畅销榜图书" />
            ) : (
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} justifyContent="space-between" spacing={1.5}>
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
            <Loading fullScreen label={t('book.fetching')} />
          ) : results.length === 0 && searched ? (
            <Empty title={t('bookSearch.noResults')} description="请检查 ISBN，或稍后重试图书信息服务" />
          ) : results.length === 0 ? (
            <Empty title="输入 ISBN 开始整理" description="可一次粘贴最多 20 个 ISBN；成功解析后会写入图书陈列库" />
          ) : (
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} justifyContent="space-between" spacing={1.5}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    本次搜索 · 共 {results.length} 本
                    {filteredResults.length !== results.length ? ` · 匹配 ${filteredResults.length} 本` : ''}
                    {filteredResults.length > PAGE_SIZE ? ` · 第 ${searchPage}/${searchTotalPages} 页` : ''}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    当前显示 {searchStart}-{searchEnd}，卡片包含书名、作者和真实图书简介。
                  </Typography>
                </Box>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                  <TextField
                    size="small"
                    value={filterText}
                    onChange={(event) => setFilterText(event.target.value)}
                    placeholder="在本次结果中筛选"
                    inputProps={{ 'aria-label': 'filter books' }}
                    InputProps={{ startAdornment: <SearchIcon fontSize="small" color="action" sx={{ mr: 1 }} /> }}
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
          <Button size="small" variant="outlined" onClick={toggleVisibleSelection} disabled={activeItems.length === 0}>
            {allVisibleSelected ? '取消本页' : '选中本页'}
          </Button>
          <Button size="small" onClick={() => setSelectedBooks(new Map())} disabled={selectedList.length === 0}>
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
