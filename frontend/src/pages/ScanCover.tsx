import { useCallback, useEffect, useRef, useState } from 'react';
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
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DeleteIcon from '@mui/icons-material/Delete';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import type { IScannerControls } from '@zxing/browser';
import { useTranslation } from 'react-i18next';
import { bookApi, type CoverRecognizeCandidate, type CoverRecognizeResult } from '@/api/book.api';
import { scanIsbnFromImage, startIsbnVideoScan } from '@/utils/barcode-scanner';
import {
  getScanHistory,
  addScanHistory,
  clearScanHistory,
  type ScanHistoryItem,
} from '@/utils/scan-history';

type Status =
  | 'idle'
  | 'scanning'
  | 'compressing'
  | 'recognizing'
  | 'success'
  | 'no-results'
  | 'error';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const handledLiveBarcodeRef = useRef(false);

  const [status, setStatus] = useState<Status>('idle');
  const [candidates, setCandidates] = useState<CoverRecognizeCandidate[]>([]);
  const [rawRecognition, setRawRecognition] =
    useState<CoverRecognizeResult['rawRecognition']>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [isManualSearching, setIsManualSearching] = useState(false);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [isLiveScanning, setIsLiveScanning] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);

  useEffect(() => {
    setHistory(getScanHistory());
  }, []);

  useEffect(() => () => scannerControlsRef.current?.stop(), []);

  const stopLiveScan = useCallback((): void => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    handledLiveBarcodeRef.current = false;
    setIsLiveScanning(false);
    setIsCameraStarting(false);
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
        setRawRecognition({ title: '', isbn, confidence: 'high' });
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
        ? new File([await compressImage(file)], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
          })
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
    stopLiveScan();
    inputRef.current?.click();
  };

  const handleLiveBarcode = async (isbn: string): Promise<void> => {
    if (handledLiveBarcodeRef.current) return;
    handledLiveBarcodeRef.current = true;
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setIsLiveScanning(false);
    setStatus('recognizing');
    setErrorMsg('');

    try {
      const result = await bookApi.resolveCoverByIsbn(isbn);
      const first = result.candidates[0];
      if (!first) {
        setErrorMsg(t('scan.noResults'));
        setStatus('no-results');
        handledLiveBarcodeRef.current = false;
        return;
      }
      saveFirstCandidate(result.candidates);
      navigate(`/books/${first.isbn}`);
    } catch (err) {
      console.error('resolveCoverByIsbn failed:', err);
      setErrorMsg(t('scan.recognizeFailed'));
      setStatus('error');
      handledLiveBarcodeRef.current = false;
    }
  };

  const handleStartLiveScan = async (): Promise<void> => {
    stopLiveScan();
    setCandidates([]);
    setRawRecognition(null);
    setErrorMsg('');
    setStatus('idle');
    setIsCameraStarting(true);
    handledLiveBarcodeRef.current = false;

    try {
      if (!videoRef.current) throw new Error('Camera preview unavailable');
      const controls = await startIsbnVideoScan(videoRef.current, (isbn) => {
        void handleLiveBarcode(isbn);
      });
      scannerControlsRef.current = controls;
      setIsLiveScanning(true);
    } catch (err) {
      console.error('startLiveScan failed:', err);
      setErrorMsg(t('scan.cameraError'));
      setStatus('error');
    } finally {
      setIsCameraStarting(false);
    }
  };

  const isRecognizing =
    status === 'scanning' || status === 'compressing' || status === 'recognizing';

  return (
    <Stack spacing={2} sx={{ maxWidth: 1220, mx: 'auto' }}>
      <Box>
        <Typography variant="h5" component="h1">
          {t('scan.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t('scan.subtitle')}
        </Typography>
      </Box>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        hidden
        onChange={handleFileSelect}
      />

      <Grid container spacing={2} aria-label="识别工作台">
        <Grid item xs={12} md={7}>
          <Card sx={{ height: { md: 'calc(100dvh - 245px)' }, minHeight: { md: 460 } }}>
            <CardContent sx={{ height: '100%', boxSizing: 'border-box' }}>
              <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0 }}>
                <Box
                  sx={{
                    height: { xs: 300, md: 'min(34dvh, 280px)' },
                    minHeight: 220,
                    border: '2px dashed',
                    borderColor: isLiveScanning ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'action.hover',
                    position: 'relative',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <Box
                    component="video"
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    aria-label="实时条码取景"
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: isLiveScanning || isCameraStarting ? 'block' : 'none',
                    }}
                  />
                  {!isLiveScanning && !isCameraStarting && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ textAlign: 'center', px: 2, zIndex: 1 }}
                    >
                      {t('scan.frameHint')}
                    </Typography>
                  )}
                  {isCameraStarting && (
                    <Stack
                      spacing={1}
                      alignItems="center"
                      sx={{ zIndex: 1, color: 'common.white' }}
                    >
                      <CircularProgress size={28} color="inherit" />
                      <Typography variant="body2">{t('scan.cameraStarting')}</Typography>
                    </Stack>
                  )}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: '40%',
                      left: '10%',
                      right: '10%',
                      height: '22%',
                      border: '2px solid',
                      borderColor: 'primary.main',
                      borderRadius: 1,
                      opacity: isLiveScanning ? 0.9 : 0.45,
                    }}
                  />
                </Box>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={
                      isRecognizing ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : (
                        <PhotoCameraIcon />
                      )
                    }
                    onClick={triggerFileInput}
                    disabled={isRecognizing || isCameraStarting}
                    fullWidth
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
                  <Button
                    variant={isLiveScanning ? 'outlined' : 'contained'}
                    color={isLiveScanning ? 'error' : 'secondary'}
                    size="large"
                    startIcon={isLiveScanning ? <StopCircleOutlinedIcon /> : <QrCodeScannerIcon />}
                    onClick={isLiveScanning ? stopLiveScan : handleStartLiveScan}
                    disabled={isRecognizing || isCameraStarting}
                    fullWidth
                  >
                    {isLiveScanning ? t('scan.stopLiveScan') : t('scan.liveScan')}
                  </Button>
                </Stack>

                {status === 'success' && (
                  <Alert severity="info" aria-label="识别结果">
                    {t('scan.candidates', { count: candidates.length })}
                  </Alert>
                )}
                {status === 'success' && rawRecognition?.confidence === 'low' && (
                  <Alert severity="warning">{t('scan.lowConfidence')}</Alert>
                )}
                {(status === 'no-results' || status === 'error') && (
                  <Alert severity="warning">{errorMsg}</Alert>
                )}

                <Box sx={{ minHeight: 0, overflowY: 'auto' }}>
                  <Stack spacing={1.5}>
                    {candidates.map((book) => (
                      <Card key={book.isbn} variant="outlined">
                        <CardActionArea onClick={() => navigate(`/books/${book.isbn}`)}>
                          <CardContent>
                            <Stack direction="row" spacing={2} alignItems="flex-start">
                              {book.coverUrl && (
                                <CardMedia
                                  component="img"
                                  image={book.coverUrl}
                                  alt={`${book.title} 封面`}
                                  sx={{ width: 72, height: 100, borderRadius: 1, flexShrink: 0 }}
                                />
                              )}
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="h6" component="h2" noWrap>
                                  {book.titleZh || book.title}
                                </Typography>
                                {book.titleZh && book.titleZh !== book.title && (
                                  <Typography variant="body2" color="text.secondary" noWrap>
                                    {book.title}
                                  </Typography>
                                )}
                                <Typography variant="body2" color="text.secondary" noWrap>
                                  {book.authorZh || book.author}
                                  {book.authorZh && book.authorZh !== book.author
                                    ? ` / ${book.author}`
                                    : ''}
                                </Typography>
                                {(book.summaryZh || book.summary) && (
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      mt: 0.5,
                                      display: '-webkit-box',
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {book.summaryZh || book.summary}
                                  </Typography>
                                )}
                                <Typography
                                  variant="button"
                                  color="primary"
                                  sx={{ mt: 0.5, display: 'block' }}
                                >
                                  {t('scan.selectCandidate')}
                                </Typography>
                              </Box>
                            </Stack>
                          </CardContent>
                        </CardActionArea>
                      </Card>
                    ))}
                  </Stack>
                </Box>

                <Typography variant="caption" color="text.secondary">
                  {t('scan.tip')}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card sx={{ height: { md: 'calc(100dvh - 245px)' }, minHeight: { md: 460 } }}>
            <CardContent sx={{ height: '100%', boxSizing: 'border-box' }}>
              <Stack spacing={2} sx={{ height: '100%', minHeight: 0 }}>
                <Box component="form" onSubmit={handleManualSearch}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                    {t('scan.manualInput')}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      size="small"
                      fullWidth
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      placeholder={t('scan.manualInputPlaceholder')}
                      disabled={isManualSearching || isRecognizing}
                    />
                    <Button
                      type="submit"
                      variant="outlined"
                      disabled={!manualTitle.trim() || isManualSearching || isRecognizing}
                      startIcon={
                        isManualSearching ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : undefined
                      }
                    >
                      {t('common.search')}
                    </Button>
                  </Stack>
                </Box>

                <Divider />

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle1" fontWeight={700}>
                    {t('scan.recentHistory')}
                  </Typography>
                  {history.length > 0 && (
                    <Button
                      size="small"
                      startIcon={<DeleteIcon />}
                      onClick={() => {
                        clearScanHistory();
                        setHistory([]);
                      }}
                    >
                      {t('scan.clearHistory')}
                    </Button>
                  )}
                </Stack>

                <Box
                  aria-label="最近识别列表"
                  sx={{ minHeight: 0, overflowY: 'auto', pr: { md: 0.5 }, flex: 1 }}
                >
                  {history.length === 0 ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ py: 4, textAlign: 'center' }}
                    >
                      {t('scan.historyEmpty')}
                    </Typography>
                  ) : (
                    <Stack spacing={1}>
                      {history.map((item) => (
                        <Card key={item.isbn} variant="outlined">
                          <CardActionArea onClick={() => navigate(`/books/${item.isbn}`)}>
                            <CardContent sx={{ py: 1.25 }}>
                              <Stack direction="row" spacing={1.5} alignItems="center">
                                {item.coverUrl && (
                                  <CardMedia
                                    component="img"
                                    image={item.coverUrl}
                                    alt={`${item.title} 封面`}
                                    sx={{ width: 44, height: 58, borderRadius: 1, flexShrink: 0 }}
                                  />
                                )}
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography variant="body1" noWrap>
                                    {item.title}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    noWrap
                                    display="block"
                                  >
                                    {item.author}
                                  </Typography>
                                </Box>
                              </Stack>
                            </CardContent>
                          </CardActionArea>
                        </Card>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
