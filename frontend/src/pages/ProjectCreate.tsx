import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Stack,
  Paper,
  Typography,
  TextField,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  FormControlLabel,
  Switch,
  Slider,
  Chip,
  Alert,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { Button } from '../components/common/Button';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { StepIndicator } from '../components/progress/StepIndicator';
import { BookSearchBar } from '../components/book/BookSearchBar';
import { ScriptEditor } from '../components/script/ScriptEditor';
import { SixSegmentView, type SixSegmentItem } from '../components/script/SixSegmentView';
import { VoiceSelector } from '../components/tts/VoiceSelector';
import { BGMPicker } from '../components/bgm/BGMPicker';
import { Loading } from '../components/common/Loading';
import { projectApi } from '../api/project.api';
import { scriptApi } from '../api/script.api';
import { useProgress } from '../hooks/useProgress';
import { useUiStore } from '../store/ui.store';
import { useProjectStore } from '../store/project.store';
import { useDebounce } from '../hooks/useDebounce';
import { bgmApi } from '../api/bgm.api';
import { ttsApi } from '../api/tts.api';
import { DEFAULT_HOST_VOICE_ID, DEFAULT_GUEST_VOICE_ID } from '../constants/voices';
import type { ScriptEmotion, ScriptStage, Speaker } from '@shared/script';
import type { ProjectMode } from '@shared/project';

const STEPS = [
  { key: 'book', label: '选书' },
  { key: 'script', label: '写脚本' },
  { key: 'voice', label: '选音色' },
  { key: 'bgm', label: '选 BGM' },
  { key: 'generate', label: '合成' },
] as const;

interface PickedBook {
  isbn: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  summary?: string | null;
}

const FADE_OPTIONS = [
  { label: '0.5s', value: 500 },
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
];

const generateId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function ProjectCreate(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const push = useUiStore((s) => s.push);
  const setCurrent = useProjectStore((s) => s.setCurrentProject);
  const current = useProjectStore((s) => s.currentProject);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [pickedBooks, setPickedBooks] = useState<PickedBook[]>([]);
  const [mode, setMode] = useState<ProjectMode>('independent');
  const [scriptText, setScriptText] = useState('');
  const [scriptMode, setScriptMode] = useState<'simple' | 'segment'>('segment');
  const [segments, setSegments] = useState<SixSegmentItem[]>([]);
  const [hostVoice, setHostVoice] = useState(DEFAULT_HOST_VOICE_ID);
  const [guestVoice, setGuestVoice] = useState(DEFAULT_GUEST_VOICE_ID);
  const [hostEmotion, setHostEmotion] = useState<ScriptEmotion>('平缓');
  const [guestEmotion, setGuestEmotion] = useState<ScriptEmotion>('平缓');
  const [introBgm, setIntroBgm] = useState('bgm-relax-1');
  const [bodyBgm, setBodyBgm] = useState('bgm-tech-1');
  const [outroBgm, setOutroBgm] = useState('bgm-human-1');
  const [voiceVolume, setVoiceVolume] = useState(80);
  const [bgmVolume, setBgmVolume] = useState(30);
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [bgmVolumeIntro, setBgmVolumeIntro] = useState(50);
  const [bgmVolumeBody, setBgmVolumeBody] = useState(30);
  const [bgmVolumeOutro, setBgmVolumeOutro] = useState(50);
  const [fadeInIntro, setFadeInIntro] = useState(1000);
  const [fadeOutIntro, setFadeOutIntro] = useState(1000);

  // seed from query params
  useEffect(() => {
    const bookId = searchParams.get('bookId');
    const title = searchParams.get('title');
    const author = searchParams.get('author');
    if (bookId) {
      setPickedBooks([
        {
          isbn: bookId,
          title: title ?? `Book ${bookId}`,
          author: author ?? 'Unknown',
        },
      ]);
      push(`已预选图书：${title ?? bookId}`, 'success');
    }
    // warm up voice / bgm caches
    void ttsApi.listVoices().catch(() => null);
    void bgmApi.list().catch(() => null);
  }, [searchParams, push]);

  // WS progress for live updates
  const projectId = current?.id ?? null;
  const { progress: liveProgress, stage: liveStage, message: liveMessage, events } = useProgress(projectId);

  // poll current project to detect completion
  useEffect(() => {
    if (!current || current.status !== 'generating') return;
    const t = setInterval(async () => {
      try {
        const p = await projectApi.get(current.id);
        setCurrent(p);
        if (p.status === 'done') {
          clearInterval(t);
          push('生成完成！', 'success');
          navigate(`/projects/${p.id}`);
        } else if (p.status === 'failed') {
          clearInterval(t);
          push('生成失败，请稍后重试', 'error');
        } else if (p.status === 'cancelled') {
          clearInterval(t);
          push('已取消', 'info');
        }
      } catch {
        // ignore
      }
    }, 4000);
    return () => clearInterval(t);
  }, [current, setCurrent, navigate, push]);

  // seed default 6-segment structure on first visit to step 2
  useEffect(() => {
    if (step === 2 && segments.length === 0 && scriptMode === 'segment') {
      const stages: ScriptStage[] = ['intro', 'introduce', 'interpret', 'review', 'suggest', 'closing'];
      const speakers: Speaker[] = ['host', 'guest', 'host', 'guest', 'host', 'guest'];
      setSegments(
        stages.map((s, i) => ({
          id: generateId(),
          speaker: speakers[i],
          stage: s,
          text: '',
          emotion: '平缓',
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, scriptMode]);

  // debounce script changes for autosave (when editing an existing project)
  const debouncedScript = useDebounce(scriptText, 1500);
  useEffect(() => {
    if (current && current.status !== 'generating' && debouncedScript && debouncedScript !== current.scriptId) {
      // best-effort autosave; we don't have an explicit PUT script endpoint here
      // beyond scriptApi.save, which requires a generated script. Skip silently.
    }
  }, [debouncedScript, current]);

  const goNext = useCallback((): void => {
    setError(null);
    if (step === 1 && pickedBooks.length === 0) {
      setError('请至少选择一本书');
      return;
    }
    if (step === 2) {
      if (scriptMode === 'simple' && !scriptText.trim()) {
        setError('请填写脚本内容');
        return;
      }
      if (scriptMode === 'segment' && segments.every((s) => !s.text.trim())) {
        setError('请至少填写一段台词');
        return;
      }
    }
    setStep((s) => Math.min(STEPS.length, s + 1));
  }, [step, pickedBooks.length, scriptText, scriptMode, segments]);

  const goPrev = useCallback((): void => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }, []);

  const handleCreate = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      // build payload
      const isbns = pickedBooks.map((b) => b.isbn);
      const created = await projectApi.create({
        title: pickedBooks[0]?.title ?? '新播客',
        mode,
        isbns,
        voices: [
          { role: 'host', voiceId: hostVoice, provider: 'volcengine' },
          { role: 'guest', voiceId: guestVoice, provider: 'volcengine' },
        ],
        bgmConfigs: [
          { segment: 'intro', bgmTrackId: introBgm, volume: bgmVolumeIntro, fadeInMs: fadeInIntro, fadeOutMs: fadeOutIntro },
          { segment: 'body', bgmTrackId: bodyBgm, volume: bgmVolumeBody, fadeInMs: 1000, fadeOutMs: 1000 },
          { segment: 'outro', bgmTrackId: outroBgm, volume: bgmVolumeOutro, fadeInMs: 1000, fadeOutMs: 1000 },
        ],
        voiceVolume,
        subtitleEnabled,
      });
      setCurrent(created);

      // best-effort: save the script if the user wrote one
      if (scriptMode === 'simple' && scriptText.trim()) {
        try {
          await scriptApi.save(created.id, {
            content: JSON.stringify({ text: scriptText }),
            rawText: scriptText,
            segments: [],
          });
        } catch {
          // non-fatal
        }
      } else if (scriptMode === 'segment' && segments.some((s) => s.text.trim())) {
        try {
          const rawText = segments
            .filter((s) => s.text.trim())
            .map((s) => `${s.speaker === 'host' ? '主持人' : '嘉宾'}: ${s.text}`)
            .join('\n');
          await scriptApi.save(created.id, {
            content: JSON.stringify({ segments }),
            rawText,
            segments: segments
              .filter((s) => s.text.trim())
              .map((s, i) => ({
                orderIndex: i,
                speaker: s.speaker,
                text: s.text,
                emotion: s.emotion,
                stage: s.stage,
              })),
          });
        } catch {
          // non-fatal
        }
      }

      // trigger generation pipeline
      const r = await projectApi.generate(created.id);
      void r;
      push('项目已创建并开始生成', 'success');
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
      push(e instanceof Error ? e.message : '创建失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const progress = current?.progress ?? liveProgress;
  const stage = current?.currentStage ?? liveStage;
  const statusMessage = liveMessage || '准备中…';

  const isFinalStep = step === STEPS.length;

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Tooltip title="返回仪表盘">
          <IconButton onClick={() => navigate('/dashboard')} aria-label="back to dashboard">
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h5" fontWeight={700}>
          {t('projectCreate.title')}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {current && (
          <Chip
            size="small"
            color={current.status === 'done' ? 'success' : current.status === 'failed' ? 'error' : 'primary'}
            label={current.status}
            variant="outlined"
          />
        )}
      </Stack>

      <Box sx={{ mb: 3 }}>
        <StepIndicator steps={STEPS.map((s) => ({ key: s.key, label: s.label }))} current={step} />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3, minHeight: 320 }}>
        {step === 1 && (
          <Stack spacing={3}>
            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                ① 选书（可批量导入 ISBN）
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                粘贴或输入 ISBN，自动从豆瓣/Google Books 拉取元数据。
              </Typography>
              <BookSearchBar
                onSearch={async (isbns) => {
                  try {
                    const r = await import('../api/book.api').then((m) =>
                      m.bookApi.fetchMetadata(isbns, 'tmp'),
                    );
                    const items = r.items ?? [];
                    setPickedBooks(
                      items.map((it) => ({
                        isbn: it.isbn,
                        title: it.title,
                        author: it.author,
                        coverUrl: it.coverUrl,
                        summary: it.summary,
                      })),
                    );
                    push(`已加载 ${items.length} 本书`, 'success');
                  } catch {
                    setPickedBooks(
                      isbns.map((isbn) => ({
                        isbn,
                        title: `示例书名 (${isbn})`,
                        author: '示例作者',
                      })),
                    );
                    push('使用占位数据 (后端无响应)', 'warning');
                  }
                }}
              />
            </Box>

            {pickedBooks.length > 0 && (
              <Box>
                <Divider sx={{ mb: 2 }} />
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    已选 {pickedBooks.length} 本
                  </Typography>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={mode}
                    onChange={(_, v) => v && setMode(v as ProjectMode)}
                  >
                    <ToggleButton value="independent">逐本独立</ToggleButton>
                    <ToggleButton value="merged">合并为单期</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
                <Stack spacing={1}>
                  {pickedBooks.map((b) => (
                    <Card key={b.isbn} variant="outlined">
                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {b.title}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {b.author} · {b.isbn}
                            </Typography>
                          </Box>
                          <Tooltip title="移除">
                            <IconButton
                              size="small"
                              onClick={() => setPickedBooks((arr) => arr.filter((x) => x.isbn !== b.isbn))}
                              aria-label="remove"
                            >
                              ×
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}

        {step === 2 && (
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="h6" fontWeight={600}>
                ② 撰写脚本
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={scriptMode}
                onChange={(_, v) => v && setScriptMode(v)}
              >
                <ToggleButton value="segment">{t('projectCreate.segmentMode')}</ToggleButton>
                <ToggleButton value="simple">{t('projectCreate.scriptMode')}</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            {scriptMode === 'simple' ? (
              <TextField
                multiline
                minRows={10}
                maxRows={20}
                fullWidth
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder={`主持人: 大家好，欢迎收听本期节目...\n嘉宾: ...`}
                inputProps={{ 'aria-label': 'script text' }}
              />
            ) : (
              <SixSegmentView value={segments} onChange={setSegments} />
            )}
          </Stack>
        )}

        {step === 3 && (
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={600}>
              ③ 选音色
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
              }}
            >
              <VoiceSelector
                role="host"
                value={hostVoice}
                emotion={hostEmotion}
                onChange={setHostVoice}
                onEmotionChange={setHostEmotion}
              />
              <VoiceSelector
                role="guest"
                value={guestVoice}
                emotion={guestEmotion}
                onChange={setGuestVoice}
                onEmotionChange={setGuestEmotion}
              />
            </Box>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
                  全局音量
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                  <Box sx={{ flex: 1, width: '100%' }}>
                    <Typography variant="caption">人声音量 {voiceVolume}%</Typography>
                    <Slider
                      value={voiceVolume}
                      min={0}
                      max={100}
                      onChange={(_, v) => setVoiceVolume(typeof v === 'number' ? v : v[0])}
                    />
                  </Box>
                  <Divider orientation="vertical" flexItem />
                  <Box sx={{ flex: 1, width: '100%' }}>
                    <Typography variant="caption">BGM 音量 {bgmVolume}%</Typography>
                    <Slider
                      value={bgmVolume}
                      min={0}
                      max={100}
                      onChange={(_, v) => setBgmVolume(typeof v === 'number' ? v : v[0])}
                    />
                  </Box>
                  <Divider orientation="vertical" flexItem />
                  <FormControlLabel
                    control={<Switch checked={subtitleEnabled} onChange={(_, v) => setSubtitleEnabled(v)} />}
                    label={`字幕 ${subtitleEnabled ? t('config.on') : t('config.off')}`}
                  />
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        )}

        {step === 4 && (
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={600}>
              ④ 选 BGM
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
              }}
            >
              <BGMPicker segment="intro" value={introBgm} onChange={setIntroBgm} volume={bgmVolumeIntro} onVolumeChange={setBgmVolumeIntro} />
              <BGMPicker segment="body" value={bodyBgm} onChange={setBodyBgm} volume={bgmVolumeBody} onVolumeChange={setBgmVolumeBody} />
              <BGMPicker segment="outro" value={outroBgm} onChange={setOutroBgm} volume={bgmVolumeOutro} onVolumeChange={setBgmVolumeOutro} />
            </Box>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                  开场 BGM 渐变
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    select
                    size="small"
                    label="渐入"
                    value={fadeInIntro}
                    onChange={(e) => setFadeInIntro(Number((e.target as HTMLInputElement).value))}
                    sx={{ minWidth: 120 }}
                    SelectProps={{ native: true }}
                  >
                    {FADE_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="渐出"
                    value={fadeOutIntro}
                    onChange={(e) => setFadeOutIntro(Number((e.target as HTMLInputElement).value))}
                    sx={{ minWidth: 120 }}
                    SelectProps={{ native: true }}
                  >
                    {FADE_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </TextField>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        )}

        {step === 5 && (
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={600}>
              ⑤ 合成与生成
            </Typography>

            {!current ? (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={2} alignItems="center" sx={{ py: 3 }}>
                    <RocketLaunchIcon sx={{ fontSize: 48, color: 'primary.main' }} aria-hidden />
                    <Typography>确认所有配置后点击「开始生成」</Typography>
                    <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                      <Chip label={`${pickedBooks.length} 本书`} />
                      <Chip label={`${scriptMode === 'simple' ? scriptText.length : segments.length} 段脚本`} />
                      <Chip label={`${hostVoice} / ${guestVoice}`} />
                      <Chip label="3 段 BGM" />
                    </Stack>
                    <Button
                      variant="contained"
                      size="large"
                      startIcon={<RocketLaunchIcon />}
                      onClick={() => void handleCreate()}
                      loading={submitting}
                    >
                      {t('common.startGenerate')}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ) : (
              <Box>
                {progress < 100 && progress > 0 && <Loading fullScreen label="生成中..." />}
                <Stack spacing={1.5}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      状态：{current.status} · 进度：{Math.round(progress)}%
                    </Typography>
                    <Box sx={{ height: 8, bgcolor: 'grey.200', borderRadius: 4, overflow: 'hidden', mt: 1 }}>
                      <Box
                        sx={{
                          height: '100%',
                          width: `${Math.max(0, Math.min(100, progress))}%`,
                          bgcolor: 'primary.main',
                          transition: 'width 0.4s',
                        }}
                      />
                    </Box>
                  </Box>
                  <Typography variant="body2">当前阶段：{stage ?? '准备'}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {statusMessage}
                  </Typography>
                  {events.length > 0 && (
                    <Box sx={{ maxHeight: 160, overflowY: 'auto', mt: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                      {events.slice(-10).reverse().map((e, i) => (
                        <Typography key={i} variant="caption" component="div" color="text.secondary">
                          {new Date(e.timestamp).toLocaleTimeString()} · {e.stage} · {e.message}
                        </Typography>
                      ))}
                    </Box>
                  )}
                  {current.status === 'done' && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button variant="contained" onClick={() => navigate(`/projects/${current.id}`)}>
                        打开项目
                      </Button>
                      <Button variant="outlined" startIcon={<SaveIcon />} onClick={() => navigate('/dashboard')}>
                        返回仪表盘
                      </Button>
                    </Stack>
                  )}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </Paper>

      {/* Navigation buttons */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={goPrev}
          disabled={step === 1 || submitting}
        >
          {t('common.prev')}
        </Button>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            第 {step} / {STEPS.length} 步
          </Typography>
        </Stack>
        {!isFinalStep ? (
          <Button
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            onClick={goNext}
            disabled={submitting}
          >
            {t('common.next')}
          </Button>
        ) : (
          <Button
            variant="contained"
            endIcon={current ? <SaveIcon /> : <AddIcon />}
            onClick={current ? () => navigate(`/projects/${current.id}`) : () => void handleCreate()}
            disabled={submitting}
          >
            {current ? '查看项目' : t('common.startGenerate')}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
