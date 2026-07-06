import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from 'react-i18next';
import { bookApi } from '@/api/book.api';
import type { BookLibraryItem } from '@shared/book';

const SOURCE_LABELS: Record<string, string> = {
  googlebooks: 'Google Books',
  openlibrary: 'Open Library',
  bookrank: 'BookRank',
  mock: '待确认',
};

const SYNC_LABELS: Record<string, string> = {
  synced: '已同步',
  partial: '部分同步',
  pending: '待同步',
  syncing: '同步中',
  failed: '同步失败',
};

function formatTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', { hour12: false });
}

/**
 * 图书详情页：左栏展示图书元数据，右栏提供主播口播稿编辑器（AI 生成 + 手动编辑保存）。
 */
export function BookDetail(): JSX.Element {
  const { t } = useTranslation();
  const { isbn = '' } = useParams<{ isbn: string }>();

  const [book, setBook] = useState<BookLibraryItem | null>(null);
  const [livePitch, setLivePitch] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    bookApi
      .getDetail(isbn)
      .then((data) => {
        if (cancelled) return;
        setBook(data);
        setLivePitch(data?.livePitch ?? '');
      })
      .catch((err) => {
        console.error('getDetail failed:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isbn]);

  const handleGenerate = async (): Promise<void> => {
    setGenerating(true);
    try {
      const result = await bookApi.generatePitch(isbn);
      setLivePitch(result.livePitch);
      setBook((prev) =>
        prev ? { ...prev, livePitch: result.livePitch, livePitchGeneratedAt: result.generatedAt } : prev,
      );
    } catch (err) {
      console.error('generatePitch failed:', err);
      alert('AI 生成口播稿失败，请稍后重试');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const updated = await bookApi.updatePitch(isbn, livePitch);
      setBook(updated);
      alert('口播稿已保存');
    } catch (err) {
      console.error('updatePitch failed:', err);
      alert('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!book) {
    return (
      <Stack spacing={2} sx={{ py: 4 }}>
        <Typography variant="h6">{t('bookDetail.notFound')}</Typography>
        <Button component={Link} to="/books" sx={{ alignSelf: 'flex-start' }}>
          {t('bookDetail.back')}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Button component={Link} to="/books" sx={{ alignSelf: 'flex-start' }}>
        {t('bookDetail.back')}
      </Button>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                {book.coverUrl && (
                  <Box
                    component="img"
                    src={book.coverUrl}
                    alt={`${book.title} 封面`}
                    sx={{ maxWidth: 200, alignSelf: 'flex-start', borderRadius: 1 }}
                  />
                )}
                <Box>
                  <Typography variant="h5" component="h1">{book.title}</Typography>
                  <Typography variant="body1" color="text.secondary">
                    {book.author}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" aria-label="图书标签">
                  {book.source && (
                    <Chip size="small" label={SOURCE_LABELS[book.source] ?? book.source} />
                  )}
                  {book.metadataSyncStatus && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={SYNC_LABELS[book.metadataSyncStatus] ?? book.metadataSyncStatus}
                    />
                  )}
                </Stack>

                <Divider sx={{ my: 0.5 }} />
                <Box component="section" aria-label="基本信息">
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    基本信息
                  </Typography>
                  <Typography variant="body2">
                    ISBN：{book.isbn}
                  </Typography>
                  {book.publisher && (
                    <Typography variant="body2">出版社：{book.publisher}</Typography>
                  )}
                  {book.publishedDate && (
                    <Typography variant="body2">出版日期：{book.publishedDate}</Typography>
                  )}
                  {book.pageCount && (
                    <Typography variant="body2">页数：{book.pageCount}</Typography>
                  )}
                </Box>

                {book.summary && (
                  <Box component="section" aria-label="图书简介">
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      简介
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {book.summary}
                    </Typography>
                  </Box>
                )}

                {(book.firstSeenAt || book.lastSeenAt) && (
                  <Box component="section" aria-label="入库信息">
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      入库信息
                    </Typography>
                    {book.firstSeenAt && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        首次入库：{formatTime(book.firstSeenAt)}
                      </Typography>
                    )}
                    {book.lastSeenAt && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        最后同步：{formatTime(book.lastSeenAt)}
                      </Typography>
                    )}
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" component="h2">{t('bookDetail.title')}</Typography>
                  {book.livePitchGeneratedAt && (
                    <Typography variant="caption" color="text.secondary">
                      {t('bookDetail.generatedAt', { time: formatTime(book.livePitchGeneratedAt) })}
                    </Typography>
                  )}
                </Stack>
                <TextField
                  multiline
                  minRows={8}
                  maxRows={20}
                  fullWidth
                  value={livePitch}
                  onChange={(e) => setLivePitch(e.target.value)}
                  placeholder="在此编辑主播口播稿，或点击 AI 生成"
                  disabled={generating || saving}
                  aria-label="主播口播稿编辑框"
                />
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AutoFixHighIcon />}
                    onClick={handleGenerate}
                    disabled={generating || saving}
                  >
                    {generating ? t('bookDetail.generating') : t('bookDetail.generate')}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<SaveIcon />}
                    onClick={handleSave}
                    disabled={generating || saving || !livePitch.trim()}
                  >
                    {saving ? t('bookDetail.saving') : t('bookDetail.save')}
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
