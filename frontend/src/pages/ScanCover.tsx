import { useEffect, useRef, useState } from 'react';
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
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import { bookApi, type CoverRecognizeCandidate, type CoverRecognizeResult } from '@/api/book.api';
import { scanIsbnFromImage } from '@/utils/barcode-scanner';
import { getScanHistory, addScanHistory, clearScanHistory, type ScanHistoryItem } from '@/utils/scan-history';

type Status = 'idle' | 'scanning' | 'compressing' | 'recognizing' | 'success' | 'no-results' | 'error';

/**
 * 用 Canvas 压缩图片，减少上传体积和 LLM token 消耗
 * @param file 原始图片文件
 * @param maxWidth 最大宽度，默认 1280
 * @param quality JPEG 质量，默认 0.8
 * @returns 压缩后的 JPEG Blob
 */
async function compressImage(file: File, maxWidth = 1280, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建 Canvas 上下文'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('图片压缩失败'));
        },
        'image/jpeg',
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };

    img.src = url;
  });
}

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
  const [rawRecognition, setRawRecognition] = useState<CoverRecognizeResult['rawRecognition']>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [isManualSearching, setIsManualSearching] = useState(false);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);

  useEffect(() => {
    setHistory(getScanHistory());
  }, []);

  const saveFirstCandidate = (items: CoverRecognizeCandidate[]): void => {
    if (items.length > 0) {
      addScanHistory(items[0]);
      setHistory(getScanHistory());
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // 清空 input 的 value，允许下次选择同一文件
    e.target.value = '';
    if (!file) return;

    setStatus('scanning');
    setErrorMsg('');
    setCandidates([]);
    setRawRecognition(null);

    try {
      // 1. 优先条码扫描（最快、最准）
      const isbn = await scanIsbnFromImage(file);
      if (isbn) {
        setRawRecognition({ isbn, confidence: 'high' });
        setStatus('recognizing');
        const result = await bookApi.resolveCoverByIsbn(isbn);
        setRawRecognition(result.rawRecognition);
        if (result.candidates.length > 0) {
          setCandidates(result.candidates);
          saveFirstCandidate(result.candidates);
          setStatus('success');
        } else {
          setErrorMsg(t('scan.noResults'));
          setStatus('no-results');
        }
        return;
      }

      // 2. 条码未命中，压缩后走视觉识别
      setStatus('compressing');
      const shouldCompress = file.size > 1024 * 1024;
      const uploadFile = shouldCompress
        ? new File([await compressImage(file)], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
        : file;

      setStatus('recognizing');
      const result = await bookApi.recognizeCover(uploadFile);
      setRawRecognition(result.rawRecognition);
      if (result.candidates.length > 0) {
        setCandidates(result.candidates);
        saveFirstCandidate(result.candidates);
        setStatus('success');
      } else if (result.rawRecognition?.title) {
        // 识别到了书名但无候选
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

  const handleManualSearch = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = manualTitle.trim();
    if (!trimmed) return;

    setIsManualSearching(true);
    setStatus('recognizing');
    setErrorMsg('');
    setCandidates([]);
    setRawRecognition(null);

    try {
      const result = await bookApi.searchCoverCandidates(trimmed);
      setRawRecognition(result.rawRecognition);
      if (result.candidates.length > 0) {
        setCandidates(result.candidates);
        saveFirstCandidate(result.candidates);
        setStatus('success');
      } else {
        setErrorMsg(t('scan.noResults'));
        setStatus('no-results');
      }
    } catch (err) {
      console.error('searchCoverCandidates failed:', err);
      setErrorMsg(t('scan.manualSearchFailed'));
      setStatus('error');
    } finally {
      setIsManualSearching(false);
    }
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

      {/* 取景提示，帮助用户把书背 ISBN 条码对准拍摄区域 */}
      <Box
        sx={{
          alignSelf: { xs: 'stretch', sm: 'flex-start' },
          width: { sm: 320 },
          aspectRatio: '3 / 4',
          border: '2px dashed',
          borderColor: 'divider',
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'action.hover',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', px: 2, zIndex: 1 }}>
          {t('scan.frameHint')}
        </Typography>
        <Box
          sx={{
            position: 'absolute',
            bottom: '15%',
            left: '10%',
            right: '10%',
            height: '18%',
            border: '2px solid',
            borderColor: 'primary.main',
            borderRadius: 1,
            opacity: 0.4,
          }}
        />
      </Box>

      <Button
        variant="contained"
        size="large"
        startIcon={
          status === 'compressing' || status === 'recognizing' ? (
            <CircularProgress size={20} color="inherit" />
          ) : (
            <PhotoCameraIcon />
          )
        }
        onClick={triggerFileInput}
        disabled={status === 'scanning' || status === 'compressing' || status === 'recognizing'}
        fullWidth
        sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, py: 1.5, px: 3, width: { sm: 'auto' } }}
      >
        {status === 'scanning'
          ? t('scan.scanningBarcode')
          : status === 'compressing'
            ? t('scan.barcodeNotFound')
            : status === 'recognizing' && rawRecognition?.isbn
              ? t('scan.barcodeFound', { isbn: rawRecognition.isbn })
              : status === 'recognizing'
                ? t('scan.recognizing')
                : t('scan.button')}
      </Button>

      {status === 'success' && (
        <Alert severity="info" aria-label="识别结果">
          {t('scan.candidates', { count: candidates.length })}
        </Alert>
      )}

      {/* 识别置信度低时提醒用户核对 */}
      {status === 'success' && rawRecognition?.confidence === 'low' && (
        <Alert severity="warning" sx={{ mt: -2 }}>
          {t('scan.lowConfidence')}
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
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'center', sm: 'flex-start' }}>
                    {book.coverUrl && (
                      <CardMedia
                        component="img"
                        image={book.coverUrl}
                        alt={`${book.title} 封面`}
                        sx={{ width: { xs: 120, sm: 80 }, height: { xs: 160, sm: 110 }, borderRadius: 1, flexShrink: 0 }}
                      />
                    )}
                    <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
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

      {/* 最近识别历史 */}
      {history.length > 0 && (
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle2">{t('scan.recentHistory')}</Typography>
            <Button
              size="small"
              startIcon={<DeleteIcon />}
              onClick={() => { clearScanHistory(); setHistory([]); }}
            >
              {t('scan.clearHistory')}
            </Button>
          </Stack>
          <Stack spacing={1}>
            {history.map((item) => (
              <Card key={item.isbn}>
                <CardActionArea onClick={() => navigate(`/books/${item.isbn}`)}>
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="center">
                      {item.coverUrl && (
                        <CardMedia
                          component="img"
                          image={item.coverUrl}
                          alt={`${item.title} 封面`}
                          sx={{ width: 48, height: 64, borderRadius: 1, flexShrink: 0 }}
                        />
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body1" noWrap>{item.title}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>{item.author}</Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
        </Box>
      )}

      {/* 手动输入兜底 */}
      {(status === 'no-results' || status === 'error' || status === 'idle') && (
        <Box component="form" onSubmit={handleManualSearch}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('scan.manualInput')}</Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              fullWidth
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder={t('scan.manualInputPlaceholder')}
              disabled={isManualSearching}
            />
            <Button
              type="submit"
              variant="outlined"
              disabled={!manualTitle.trim() || isManualSearching}
              startIcon={isManualSearching ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
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
