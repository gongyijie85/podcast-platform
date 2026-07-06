import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { useTranslation } from 'react-i18next';
import { bookApi, type CoverRecognizeCandidate } from '@/api/book.api';

type Status = 'idle' | 'recognizing' | 'success' | 'no-results' | 'error';

/**
 * 扫码/拍摄封面识别图书页面
 * - 原生 input capture 调起摄像头（移动端）或文件选择（桌面端）
 * - 上传 → 后端 agnes-2.0-flash 识别 → Google Books 搜索 → 候选列表
 * - 点击候选卡片跳转 /books/:isbn 复用现有口播稿页面
 */
export function ScanCover(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [candidates, setCandidates] = useState<CoverRecognizeCandidate[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [manualTitle, setManualTitle] = useState('');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // 清空 input 的 value，允许下次选择同一文件
    e.target.value = '';
    if (!file) return;

    setStatus('recognizing');
    setErrorMsg('');
    setCandidates([]);

    try {
      const result = await bookApi.recognizeCover(file);
      if (result.candidates.length > 0) {
        setCandidates(result.candidates);
        setStatus('success');
      } else if (result.rawRecognition?.title) {
        // 识别到了书名但 Google Books 无候选
        setErrorMsg(t('scan.noResults'));
        setStatus('no-results');
      } else {
        setErrorMsg(t('scan.recognizeFailed'));
        setStatus('no-results');
      }
    } catch (err) {
      console.error('recognizeCover failed:', err);
      setErrorMsg(t('scan.recognizeFailed'));
      setStatus('error');
    }
  };

  const handleManualSearch = (e: React.FormEvent): void => {
    e.preventDefault();
    // 手动输入书名 → 跳转选书库带搜索参数
    const trimmed = manualTitle.trim();
    if (!trimmed) return;
    navigate(`/books?q=${encodeURIComponent(trimmed)}`);
  };

  const triggerFileInput = (): void => {
    inputRef.current?.click();
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1">{t('scan.title')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t('scan.subtitle')}
        </Typography>
      </Box>

      {/* 隐藏的原生 input，支持摄像头拍照和文件上传 */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        hidden
        onChange={handleFileSelect}
      />

      <Button
        variant="contained"
        size="large"
        startIcon={status === 'recognizing' ? <CircularProgress size={20} color="inherit" /> : <PhotoCameraIcon />}
        onClick={triggerFileInput}
        disabled={status === 'recognizing'}
        sx={{ alignSelf: 'flex-start', py: 1.5, px: 3 }}
      >
        {status === 'recognizing' ? t('scan.recognizing') : t('scan.button')}
      </Button>

      {status === 'success' && (
        <Alert severity="info" aria-label="识别结果">
          {t('scan.candidates', { count: candidates.length })}
        </Alert>
      )}

      {(status === 'no-results' || status === 'error') && (
        <Alert severity="warning">{errorMsg}</Alert>
      )}

      {/* 候选图书卡片列表 */}
      {candidates.length > 0 && (
        <Stack spacing={2}>
          {candidates.map((book) => (
            <Card key={book.isbn}>
              <CardActionArea onClick={() => navigate(`/books/${book.isbn}`)}>
                <CardContent>
                  <Stack direction="row" spacing={2}>
                    {book.coverUrl && (
                      <CardMedia
                        component="img"
                        image={book.coverUrl}
                        alt={`${book.title} 封面`}
                        sx={{ width: 80, height: 110, borderRadius: 1, flexShrink: 0 }}
                      />
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="h6" component="h2" noWrap>{book.title}</Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>{book.author}</Typography>
                      {book.publisher && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {book.publisher}{book.publishedDate ? ` · ${book.publishedDate}` : ''}
                        </Typography>
                      )}
                      {book.summary && (
                        <Typography
                          variant="body2"
                          sx={{
                            mt: 1,
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {book.summary}
                        </Typography>
                      )}
                      <Typography variant="button" color="primary" sx={{ mt: 1, display: 'block' }}>
                        {t('scan.selectCandidate')}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}

      {/* 手动输入兜底 */}
      {(status === 'no-results' || status === 'error') && (
        <Box component="form" onSubmit={handleManualSearch}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('scan.manualInput')}</Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              fullWidth
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder={t('scan.manualInputPlaceholder')}
            />
            <Button type="submit" variant="outlined" disabled={!manualTitle.trim()}>
              {t('common.search')}
            </Button>
          </Stack>
        </Box>
      )}

      <Typography variant="caption" color="text.secondary">
        {t('scan.tip')}
      </Typography>
    </Stack>
  );
}
