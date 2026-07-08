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
import type { BookEnrichment, BookLibraryItem } from '@shared/book';

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

function stringifyEnrichment(value: BookEnrichment | null | undefined): string {
  return JSON.stringify(value ?? { manualNotes: '' }, null, 2);
}

function listText(items: string[] | undefined): string {
  return items?.filter(Boolean).join('；') || '暂无';
}

/**
 * 图书详情页：展示图书元数据与主播口播稿（AI 生成 + 手动编辑保存）。
 */
export function BookDetail(): JSX.Element {
  const { t } = useTranslation();
  const { isbn = '' } = useParams<{ isbn: string }>();

  const [book, setBook] = useState<BookLibraryItem | null>(null);
  const [livePitch, setLivePitch] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [enrichmentText, setEnrichmentText] = useState('');
  const [savingEnrichment, setSavingEnrichment] = useState(false);
  const [generatingEnrichment, setGeneratingEnrichment] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    bookApi
      .getDetail(isbn)
      .then((data) => {
        if (cancelled) return;
        setBook(data);
        setLivePitch(data?.livePitch ?? '');
        setEnrichmentText(stringifyEnrichment(data?.enrichment));
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
      setEditing(false);
      alert('口播稿已保存');
    } catch (err) {
      console.error('updatePitch failed:', err);
      alert('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEnrichment = async (): Promise<void> => {
    setSavingEnrichment(true);
    try {
      const enrichment = JSON.parse(enrichmentText || '{}') as BookEnrichment;
      const updated = await bookApi.updateEnrichment(isbn, enrichment);
      setBook(updated);
      setEnrichmentText(stringifyEnrichment(updated.enrichment));
      alert('主播延展资料已保存');
    } catch (err) {
      console.error('updateEnrichment failed:', err);
      alert('保存失败，请检查 JSON 格式');
    } finally {
      setSavingEnrichment(false);
    }
  };

  const handleGenerateEnrichment = async (): Promise<void> => {
    setGeneratingEnrichment(true);
    try {
      const updated = await bookApi.generateEnrichment(isbn);
      setBook(updated);
      setEnrichmentText(stringifyEnrichment(updated.enrichment));
      alert('主播资料包已生成');
    } catch (err) {
      console.error('generateEnrichment failed:', err);
      alert('生成资料包失败，请稍后重试');
    } finally {
      setGeneratingEnrichment(false);
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
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                {book.coverUrl && (
                  <Box
                    component="img"
                    src={book.coverUrl}
                    alt={`${book.title} 封面`}
                    sx={{
                      maxWidth: { xs: 160, sm: 200 },
                      width: '100%',
                      alignSelf: { xs: 'center', sm: 'flex-start' },
                      borderRadius: 1,
                    }}
                  />
                )}
                <Box>
                  <Typography variant="h5" component="h1">
                    {book.titleZh || book.title}
                  </Typography>
                  {book.titleZh && book.titleZh !== book.title && (
                    <Typography variant="body2" color="text.secondary">
                      {book.title}
                    </Typography>
                  )}
                  <Typography variant="body1" color="text.secondary">
                    {book.authorZh || book.author}
                    {book.authorZh && book.authorZh !== book.author ? ` / ${book.author}` : ''}
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
                <Box component="section" aria-label="主播口播稿">
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle2" color="text.secondary">
                        {t('bookDetail.title')}
                      </Typography>
                      {book.livePitchGeneratedAt && (
                        <Typography variant="caption" color="text.secondary">
                          {t('bookDetail.generatedAt', {
                            time: formatTime(book.livePitchGeneratedAt),
                          })}
                        </Typography>
                      )}
                    </Stack>
                    {editing ? (
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
                    ) : (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {livePitch || '暂无口播稿'}
                      </Typography>
                    )}
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'stretch', sm: 'center' }}
                    >
                      <Button
                        variant="contained"
                        color="primary"
                        startIcon={<AutoFixHighIcon />}
                        onClick={handleGenerate}
                        disabled={generating || saving}
                        fullWidth
                        sx={{ width: { sm: 'auto' } }}
                      >
                        {generating ? t('bookDetail.generating') : t('bookDetail.generate')}
                      </Button>
                      {editing ? (
                        <>
                          <Button
                            variant="outlined"
                            startIcon={<SaveIcon />}
                            onClick={handleSave}
                            disabled={generating || saving || !livePitch.trim()}
                            fullWidth
                            sx={{ width: { sm: 'auto' } }}
                          >
                            {saving ? t('bookDetail.saving') : t('bookDetail.save')}
                          </Button>
                          <Button
                            onClick={() => {
                              setLivePitch(book.livePitch ?? '');
                              setEditing(false);
                            }}
                            disabled={generating || saving}
                          >
                            取消
                          </Button>
                        </>
                      ) : (
                        <Button variant="outlined" onClick={() => setEditing(true)}>
                          编辑
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                </Box>

                <Box component="section" aria-label="基本信息">
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    基本信息
                  </Typography>
                  <Typography variant="body2">
                    ISBN：{book.isbn}
                  </Typography>
                  {(book.publisher || book.publisherZh) && (
                    <Typography variant="body2">
                      出版社：{book.publisherZh || book.publisher}
                      {book.publisherZh && book.publisherZh !== book.publisher ? ` / ${book.publisher}` : ''}
                    </Typography>
                  )}
                  {book.publishedDate && (
                    <Typography variant="body2">出版日期：{book.publishedDate}</Typography>
                  )}
                  {book.pageCount && (
                    <Typography variant="body2">页数：{book.pageCount}</Typography>
                  )}
                </Box>

                {(book.summaryZh || book.summary) && (
                  <Box component="section" aria-label="图书简介">
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      简介
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {book.summaryZh || book.summary}
                    </Typography>
                    {book.summaryZh && book.summaryZh !== book.summary && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        原文：{book.summary}
                      </Typography>
                    )}
                  </Box>
                )}

                <Box component="section" aria-label="主播延展资料">
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    主播延展资料
                  </Typography>
                  {book.enrichment?.ratings?.length ? (
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
                      {book.enrichment.ratings.map((item) => (
                        <Chip
                          key={`${item.source}-${item.label}`}
                          size="small"
                          label={`${item.label} ${item.score}${item.count ? `（${item.count}条）` : ''}`}
                        />
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      暂无评分背书
                    </Typography>
                  )}
                  <Typography variant="body2">
                    卖点：{listText(book.enrichment?.hostBriefZh?.sellingPoints)}
                  </Typography>
                  <Typography variant="body2">
                    适合人群：{listText(book.enrichment?.hostBriefZh?.audience)}
                  </Typography>
                  <Typography variant="body2">
                    评价摘要：{listText(book.enrichment?.reviewInsights?.positives)}
                  </Typography>
                  {book.enrichment?.relatedBooks?.length ? (
                    <Typography variant="body2">
                      相关推荐：{book.enrichment.relatedBooks.map((item) => item.reasonZh ? `${item.title}（${item.reasonZh}）` : item.title).join('；')}
                    </Typography>
                  ) : null}
                  <TextField
                    multiline
                    minRows={6}
                    maxRows={16}
                    fullWidth
                    value={enrichmentText}
                    onChange={(e) => setEnrichmentText(e.target.value)}
                    placeholder='{"manualNotes":"粘贴 Amazon/Goodreads 资料摘要"}'
                    aria-label="主播延展资料编辑框"
                    sx={{ mt: 2 }}
                    disabled={savingEnrichment || generatingEnrichment}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                    <Button
                      variant="outlined"
                      startIcon={<SaveIcon />}
                      onClick={handleSaveEnrichment}
                      disabled={savingEnrichment || generatingEnrichment}
                    >
                      {savingEnrichment ? '保存中...' : '保存延展资料'}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<AutoFixHighIcon />}
                      onClick={handleGenerateEnrichment}
                      disabled={savingEnrichment || generatingEnrichment}
                    >
                      {generatingEnrichment ? '生成中...' : '生成资料包'}
                    </Button>
                  </Stack>
                </Box>

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
      </Grid>
    </Stack>
  );
}
