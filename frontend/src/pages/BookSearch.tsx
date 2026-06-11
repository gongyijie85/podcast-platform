import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Stack,
  Typography,
  Paper,
  Button,
} from '@mui/material';
import { BookSearchBar } from '../components/book/BookSearchBar';
import { BookCard } from '../components/book/BookCard';
import { Loading } from '../components/common/Loading';
import { Empty } from '../components/common/Empty';
import { bookApi } from '../api/book.api';
import { useUiStore } from '../store/ui.store';
import { normalizeIsbn } from '../utils/isbn';
import type { BookMetadata } from '@shared/book';

interface SearchResult extends BookMetadata {
  /** marked when result came from a server-side fetch (real metadata) */
  fromCache?: boolean;
}

export function BookSearch(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initial = searchParams.get('bookId') ?? '';
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const push = useUiStore((s) => s.push);

  // If the user landed here with a pre-selected book id, fetch its detail.
  useEffect(() => {
    if (initial) {
      void handleSearch([initial]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (isbns: string[]): Promise<void> => {
    setLoading(true);
    setSearched(true);
    try {
      const norm = isbns.map((i) => normalizeIsbn(i) ?? i);
      const r = await bookApi.fetchMetadata(norm, 'tmp-search');
      const items: SearchResult[] = r.items.map((b) => ({ ...b }));
      setResults(items);
      if (items.length === 0) {
        push(t('bookSearch.noResults'), 'info');
      }
    } catch {
      // backend may not support direct fetch without a real project; provide
      // an offline-friendly fallback so the demo flow is still usable.
      const offline: SearchResult[] = isbns.map((isbn) => ({
        isbn,
        title: `示例书名 (${isbn})`,
        author: '示例作者',
        coverUrl: null,
        summary: '这是一个本地占位记录。当后端元数据服务可用时，会被真实数据替换。',
        source: 'mock',
      }));
      setResults(offline);
      push('后端未返回结果，已使用占位数据', 'warning');
    } finally {
      setLoading(false);
    }
  };

  const onUseBook = (b: BookMetadata): void => {
    const params = new URLSearchParams();
    params.set('bookId', b.isbn);
    params.set('title', b.title);
    params.set('author', b.author);
    navigate(`/projects/new?${params.toString()}`);
  };

  return (
    <Box>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            {t('bookSearch.title')}
          </Typography>
          <Typography color="text.secondary">
            支持 ISBN-10 / ISBN-13，多本书可一次性粘贴（每行一个或逗号分隔）。
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <BookSearchBar onSearch={(isbns) => void handleSearch(isbns)} />
        </Paper>

        {loading ? (
          <Loading fullScreen label={t('book.fetching')} />
        ) : results.length === 0 && searched ? (
          <Empty title={t('bookSearch.noResults')} description="尝试调整搜索词或更换 ISBN" />
        ) : results.length === 0 ? (
          <Empty
            title="输入 ISBN 开始搜索"
            description="例如 9787121362200（可粘贴多本）"
          />
        ) : (
          <>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="h6" fontWeight={600}>
                共 {results.length} 条结果
              </Typography>
              <Button size="small" onClick={() => setResults([])}>
                清空结果
              </Button>
            </Stack>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
              }}
            >
              {results.map((b) => (
                <BookCard key={b.isbn} book={b} onUse={onUseBook} />
              ))}
            </Box>
          </>
        )}
      </Stack>
    </Box>
  );
}
