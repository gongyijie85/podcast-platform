import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import SaveIcon from '@mui/icons-material/Save';
import { Button } from '../components/common/Button';
import { StepIndicator } from '../components/progress/StepIndicator';
import { BookSearchBar } from '../components/book/BookSearchBar';
import { BookCard } from '../components/book/BookCard';
import { VoiceSelector } from '../components/tts/VoiceSelector';
import { BGMPicker } from '../components/bgm/BGMPicker';
import { Loading } from '../components/common/Loading';
import { bookApi } from '../api/book.api';
import { projectApi } from '../api/project.api';
import { bgmApi } from '../api/bgm.api';
import { ttsApi } from '../api/tts.api';
import { useProgress } from '../hooks/useProgress';
import { useUiStore } from '../store/ui.store';
import { useProjectStore } from '../store/project.store';
import { localStorageAdapter } from '../storage/local-storage.adapter';
import { normalizeIsbn } from '../utils/isbn';
import {
  DEFAULT_GUEST_VOICE_ID,
  DEFAULT_HOST_VOICE_ID,
  VOICE_PRESETS,
  getVoiceProvider,
  type VoicePresetId,
} from '../constants/voices';
import type { BookMetadata } from '@shared/book';
import type { ProjectDto, ProjectMode, ScriptTemplate } from '@shared/project';
import type { ScriptEmotion } from '@shared/script';

const STEPS = [
  { key: 'book', label: '选书' },
  { key: 'settings', label: '生成设置' },
  { key: 'generate', label: '生成中' },
] as const;

const SCRIPT_TEMPLATES: Array<{ value: ScriptTemplate; label: string; hint: string }> = [
  { value: 'audio-overview', label: 'AI 深潜播客', hint: '先策划节目问题，再做双人追问式解读' },
  { value: 'default', label: '默认六段式', hint: '清晰导读，兼顾信息密度和可听性' },
  { value: 'deep-review', label: '深度书评', hint: '强化观点、证据、争议和反思' },
  { value: 'casual-talk', label: '轻松对谈', hint: '更口语、更有来回感，适合泛听' },
  { value: 'academic', label: '学术解读', hint: '突出概念、脉络和理论框架' },
];

const FADE_OPTIONS = [
  { label: '0.5s', value: 500 },
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
];

const BGM_PRESETS = [
  {
    id: 'balanced-reading',
    name: '均衡导读',
    description: '轻柔开场，人文底色，适合多数图书播客。',
    introBgm: 'bgm-relax-1',
    bodyBgm: 'bgm-human-1',
    outroBgm: 'bgm-human-2',
    introVolume: 22,
    bodyVolume: 12,
    outroVolume: 20,
    fadeInMs: 1000,
    fadeOutMs: 1500,
  },
  {
    id: 'conversation-light',
    name: '轻松对谈',
    description: '节奏更明亮，适合新书盘点和多书聊天。',
    introBgm: 'bgm-relax-2',
    bodyBgm: 'bgm-relax-3',
    outroBgm: 'bgm-relax-1',
    introVolume: 24,
    bodyVolume: 14,
    outroVolume: 22,
    fadeInMs: 500,
    fadeOutMs: 1000,
  },
  {
    id: 'documentary-depth',
    name: '深度纪实',
    description: '低调、克制，适合深度书评和历史议题。',
    introBgm: 'bgm-doc-1',
    bodyBgm: 'bgm-doc-3',
    outroBgm: 'bgm-human-1',
    introVolume: 20,
    bodyVolume: 10,
    outroVolume: 18,
    fadeInMs: 1000,
    fadeOutMs: 2000,
  },
  {
    id: 'tech-clean',
    name: '清爽科技',
    description: '更现代的背景声，适合商业、科技、趋势类选题。',
    introBgm: 'bgm-tech-2',
    bodyBgm: 'bgm-tech-1',
    outroBgm: 'bgm-tech-3',
    introVolume: 20,
    bodyVolume: 10,
    outroVolume: 18,
    fadeInMs: 500,
    fadeOutMs: 1500,
  },
] as const;

type BgmPresetId = (typeof BGM_PRESETS)[number]['id'] | 'custom';

const GUEST_PROJECT_IDS_KEY = 'guest.projectIds';

export function ProjectCreate(): JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const push = useUiStore((s) => s.push);
  const setCurrent = useProjectStore((s) => s.setCurrentProject);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<Array<{ isbn: string; reason: string }>>([]);
  const [project, setProject] = useState<ProjectDto | null>(null);

  const [pickedBooks, setPickedBooks] = useState<BookMetadata[]>([]);
  const [mode, setMode] = useState<ProjectMode>('independent');
  const [scriptTemplate, setScriptTemplate] = useState<ScriptTemplate>('audio-overview');
  const [voicePresetId, setVoicePresetId] = useState<VoicePresetId>('professional-reading');
  const [hostVoice, setHostVoice] = useState(DEFAULT_HOST_VOICE_ID);
  const [guestVoice, setGuestVoice] = useState(DEFAULT_GUEST_VOICE_ID);
  const [hostEmotion, setHostEmotion] = useState<ScriptEmotion>('平缓');
  const [guestEmotion, setGuestEmotion] = useState<ScriptEmotion>('平缓');
  const [bgmPresetId, setBgmPresetId] = useState<BgmPresetId>('balanced-reading');
  const [introBgm, setIntroBgm] = useState('bgm-relax-1');
  const [bodyBgm, setBodyBgm] = useState('bgm-human-1');
  const [outroBgm, setOutroBgm] = useState('bgm-human-2');
  const [voiceVolume, setVoiceVolume] = useState(80);
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [bgmVolumeIntro, setBgmVolumeIntro] = useState(22);
  const [bgmVolumeBody, setBgmVolumeBody] = useState(12);
  const [bgmVolumeOutro, setBgmVolumeOutro] = useState(20);
  const [fadeInIntro, setFadeInIntro] = useState(1000);
  const [fadeOutIntro, setFadeOutIntro] = useState(1500);

  const projectId = project?.id ?? null;
  const { progress: liveProgress, stage: liveStage, message: liveMessage, events } = useProgress(projectId);

  const resolveBooks = useCallback(
    async (isbns: string[], source: 'query' | 'search' = 'search'): Promise<void> => {
      const normalized = isbns
        .map((isbn) => normalizeIsbn(isbn) ?? isbn.trim())
        .filter(Boolean)
        .slice(0, 20);
      if (normalized.length === 0) return;

      setResolving(true);
      setError(null);
      setFailed([]);
      try {
        const response = await bookApi.resolveMetadata(normalized);
        setPickedBooks(response.items);
        setFailed(response.failed);
        if (response.items.length > 1) {
          setMode('merged');
        }
        if (response.items.length === 0) {
          setError('没有获取到可用于生成的图书信息，请检查 ISBN 后重试');
          push('没有获取到图书信息', 'warning');
        } else {
          push(source === 'query' ? '已加载预选图书' : `已加载 ${response.items.length} 本书`, 'success');
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : '未知错误';
        setPickedBooks([]);
        setError(`图书信息获取失败：${message}`);
        push('图书信息获取失败', 'error');
      } finally {
        setResolving(false);
      }
    },
    [push],
  );

  useEffect(() => {
    setCurrent(null);
    const repeatedBookIds = searchParams.getAll('bookId');
    const packedBookIds = searchParams.get('bookIds')?.split(/[\s,;]+/).filter(Boolean) ?? [];
    const bookIds = repeatedBookIds.length > 0 ? repeatedBookIds : packedBookIds;
    if (bookIds.length > 0) {
      void resolveBooks(bookIds, 'query');
    }
    void ttsApi.listVoices().catch(() => null);
    void bgmApi.list().catch(() => null);
  }, [searchParams, resolveBooks, setCurrent]);

  useEffect(() => {
    if (!project || project.status !== 'generating') return;
    const timer = setInterval(async () => {
      try {
        const fresh = await projectApi.get(project.id);
        setProject(fresh);
        setCurrent(fresh);
        if (fresh.status === 'done') {
          clearInterval(timer);
          push('生成完成！', 'success');
          navigate(`/projects/${fresh.id}`);
        } else if (fresh.status === 'failed') {
          clearInterval(timer);
          setError('生成失败，请稍后重试或打开项目详情查看错误');
          push('生成失败，请稍后重试', 'error');
        }
      } catch {
        // Polling failures should not interrupt the visible progress stream.
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [project, navigate, push, setCurrent]);

  const selectedPreset = VOICE_PRESETS.find((preset) => preset.id === voicePresetId) ?? VOICE_PRESETS[0];
  const selectedTemplate = SCRIPT_TEMPLATES.find((tpl) => tpl.value === scriptTemplate) ?? SCRIPT_TEMPLATES[0];

  const goNext = useCallback((): void => {
    setError(null);
    if (step === 1 && pickedBooks.length === 0) {
      setError('请至少选择一本书');
      return;
    }
    setStep((value) => Math.min(STEPS.length, value + 1));
  }, [step, pickedBooks.length]);

  const goPrev = useCallback((): void => {
    setError(null);
    setStep((value) => Math.max(1, value - 1));
  }, []);

  const applyVoicePreset = (id: VoicePresetId): void => {
    const preset = VOICE_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setVoicePresetId(id);
    setHostVoice(preset.hostVoiceId);
    setGuestVoice(preset.guestVoiceId);
  };

  const applyBgmPreset = (id: BgmPresetId): void => {
    setBgmPresetId(id);
    if (id === 'custom') return;
    const preset = BGM_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setIntroBgm(preset.introBgm);
    setBodyBgm(preset.bodyBgm);
    setOutroBgm(preset.outroBgm);
    setBgmVolumeIntro(preset.introVolume);
    setBgmVolumeBody(preset.bodyVolume);
    setBgmVolumeOutro(preset.outroVolume);
    setFadeInIntro(preset.fadeInMs);
    setFadeOutIntro(preset.fadeOutMs);
  };

  const markCustomBgm = (): void => setBgmPresetId('custom');

  const handleCreate = async (): Promise<void> => {
    if (pickedBooks.length === 0) {
      setError('请至少选择一本书');
      setStep(1);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const isbns = pickedBooks.map((book) => book.isbn);
      const title =
        pickedBooks.length === 1
          ? `${pickedBooks[0].title} 播客`
          : `${pickedBooks[0].title} 等 ${pickedBooks.length} 本书播客`;

      const created = await projectApi.create({
        title,
        mode,
        isbns,
        books: pickedBooks,
        scriptTemplate,
        voices: [
          { role: 'host', voiceId: hostVoice, provider: getVoiceProvider(hostVoice) },
          { role: 'guest', voiceId: guestVoice, provider: getVoiceProvider(guestVoice) },
        ],
        bgmConfigs: [
          {
            segment: 'intro',
            bgmTrackId: introBgm,
            volume: bgmVolumeIntro,
            fadeInMs: fadeInIntro,
            fadeOutMs: fadeOutIntro,
          },
          { segment: 'body', bgmTrackId: bodyBgm, volume: bgmVolumeBody, fadeInMs: 1000, fadeOutMs: 1000 },
          { segment: 'outro', bgmTrackId: outroBgm, volume: bgmVolumeOutro, fadeInMs: 1000, fadeOutMs: 1000 },
        ],
        voiceVolume,
        subtitleEnabled,
      });

      setProject(created);
      setCurrent(created);
      const guestIds = localStorageAdapter.get<string[]>(GUEST_PROJECT_IDS_KEY) ?? [];
      if (!created.userId && !guestIds.includes(created.id)) {
        localStorageAdapter.set(GUEST_PROJECT_IDS_KEY, [...guestIds, created.id]);
      }

      const started = await projectApi.generate(created.id, { scriptTemplate });
      const generatingProject = started.project ?? { ...created, status: 'generating' as const, progress: 0, currentStage: 'script' as const };
      setProject(generatingProject);
      setCurrent(generatingProject);
      setStep(3);
      push('项目已创建并开始生成', 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : '创建或启动生成失败';
      setError(message);
      push(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const progress = project?.progress ?? liveProgress;
  const stage = project?.currentStage ?? liveStage;
  const statusMessage = liveMessage || (project ? '生成任务已启动' : '准备开始生成');
  const isFinalStep = step === STEPS.length;

  return (
    <Box sx={{ maxWidth: 1040, mx: 'auto' }}>
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
        {project && (
          <Chip
            size="small"
            color={project.status === 'done' ? 'success' : project.status === 'failed' ? 'error' : 'primary'}
            label={project.status}
            variant="outlined"
          />
        )}
      </Stack>

      <Box sx={{ mb: 3 }}>
        <StepIndicator steps={STEPS.map((item) => ({ key: item.key, label: item.label }))} current={step} />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {failed.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          未获取到 {failed.length} 本书：{failed.map((item) => item.isbn).join('、')}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3, minHeight: 360 }}>
        {step === 1 && (
          <Stack spacing={3}>
            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                选书
              </Typography>
              <BookSearchBar maxIsbns={20} onSearch={(isbns) => void resolveBooks(isbns)} />
            </Box>

            {resolving ? (
              <Loading label={t('book.fetching')} />
            ) : pickedBooks.length > 0 ? (
              <Stack spacing={2}>
                <Divider />
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    已选 {pickedBooks.length} 本
                  </Typography>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={mode}
                    onChange={(_, value) => value && setMode(value as ProjectMode)}
                  >
                    <ToggleButton value="independent">逐本独立</ToggleButton>
                    <ToggleButton value="merged">合并为单期</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                  }}
                >
                  {pickedBooks.map((book) => (
                    <BookCard
                      key={`${book.isbn}-${book.source}`}
                      book={book}
                      selected
                      onRemove={(target) => setPickedBooks((items) => items.filter((item) => item.isbn !== target.isbn))}
                    />
                  ))}
                </Box>
              </Stack>
            ) : (
              <Alert severity="info">从图书整理页选择书籍，或在这里输入 ISBN 后开始生成。</Alert>
            )}
          </Stack>
        )}

        {step === 2 && (
          <Stack spacing={3}>
            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                生成设置
              </Typography>
              <Typography variant="body2" color="text.secondary">
                AI 将基于已选书籍自动生成双人对谈脚本。
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                脚本模板
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gap: 1.5,
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
                }}
              >
                {SCRIPT_TEMPLATES.map((template) => {
                  const active = template.value === scriptTemplate;
                  return (
                    <Card
                      key={template.value}
                      variant="outlined"
                      onClick={() => setScriptTemplate(template.value)}
                      sx={{
                        cursor: 'pointer',
                        borderColor: active ? 'primary.main' : 'divider',
                        bgcolor: active ? 'action.selected' : 'background.paper',
                      }}
                    >
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack spacing={0.75}>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            {active ? <CheckCircleIcon color="primary" fontSize="small" /> : <RadioButtonUncheckedIcon fontSize="small" />}
                            <Typography variant="subtitle2" fontWeight={700}>
                              {template.label}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {template.hint}
                          </Typography>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            </Box>

            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                声音方案
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gap: 1.5,
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                }}
              >
                {VOICE_PRESETS.map((preset) => {
                  const active = preset.id === voicePresetId;
                  return (
                    <Card
                      key={preset.id}
                      variant="outlined"
                      onClick={() => applyVoicePreset(preset.id)}
                      sx={{
                        cursor: 'pointer',
                        borderColor: active ? 'primary.main' : 'divider',
                        bgcolor: active ? 'action.selected' : 'background.paper',
                      }}
                    >
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack spacing={0.75}>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            {active ? <CheckCircleIcon color="primary" fontSize="small" /> : <RadioButtonUncheckedIcon fontSize="small" />}
                            <Typography variant="subtitle2" fontWeight={700}>
                              {preset.name}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {preset.description}
                          </Typography>
                          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                            <Chip size="small" label={`主持人 ${preset.hostVoiceId}`} variant="outlined" />
                            <Chip size="small" label={`嘉宾 ${preset.guestVoiceId}`} variant="outlined" />
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            </Box>

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
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Box sx={{ flex: 1, width: '100%' }}>
                    <Typography variant="caption">人声音量 {voiceVolume}%</Typography>
                    <Slider
                      value={voiceVolume}
                      min={0}
                      max={100}
                      onChange={(_, value) => setVoiceVolume(typeof value === 'number' ? value : value[0])}
                    />
                  </Box>
                  <FormControlLabel
                    control={<Switch checked={subtitleEnabled} onChange={(_, value) => setSubtitleEnabled(value)} />}
                    label={`字幕 ${subtitleEnabled ? t('config.on') : t('config.off')}`}
                  />
                </Stack>
              </CardContent>
            </Card>

            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                BGM 模板
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gap: 1.5,
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
                }}
              >
                {BGM_PRESETS.map((preset) => {
                  const active = bgmPresetId === preset.id;
                  return (
                    <Card
                      key={preset.id}
                      variant="outlined"
                      onClick={() => applyBgmPreset(preset.id)}
                      sx={{
                        cursor: 'pointer',
                        borderColor: active ? 'primary.main' : 'divider',
                        bgcolor: active ? 'action.selected' : 'background.paper',
                      }}
                    >
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack spacing={0.75}>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            {active ? <CheckCircleIcon color="primary" fontSize="small" /> : <RadioButtonUncheckedIcon fontSize="small" />}
                            <Typography variant="subtitle2" fontWeight={700}>
                              {preset.name}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {preset.description}
                          </Typography>
                          <Chip size="small" label={`正片 ${preset.bodyVolume}%`} variant="outlined" sx={{ alignSelf: 'flex-start' }} />
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
              {bgmPresetId === 'custom' && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  当前为自定义 BGM 配置
                </Typography>
              )}
            </Box>

            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                BGM 细节
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                }}
              >
                <BGMPicker
                  segment="intro"
                  value={introBgm}
                  onChange={(value) => {
                    markCustomBgm();
                    setIntroBgm(value);
                  }}
                  volume={bgmVolumeIntro}
                  onVolumeChange={(value) => {
                    markCustomBgm();
                    setBgmVolumeIntro(value);
                  }}
                />
                <BGMPicker
                  segment="body"
                  value={bodyBgm}
                  onChange={(value) => {
                    markCustomBgm();
                    setBodyBgm(value);
                  }}
                  volume={bgmVolumeBody}
                  onVolumeChange={(value) => {
                    markCustomBgm();
                    setBgmVolumeBody(value);
                  }}
                />
                <BGMPicker
                  segment="outro"
                  value={outroBgm}
                  onChange={(value) => {
                    markCustomBgm();
                    setOutroBgm(value);
                  }}
                  volume={bgmVolumeOutro}
                  onVolumeChange={(value) => {
                    markCustomBgm();
                    setBgmVolumeOutro(value);
                  }}
                />
              </Box>
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
                    onChange={(event) => {
                      markCustomBgm();
                      setFadeInIntro(Number(event.target.value));
                    }}
                    sx={{ minWidth: 120 }}
                    SelectProps={{ native: true }}
                  >
                    {FADE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="渐出"
                    value={fadeOutIntro}
                    onChange={(event) => {
                      markCustomBgm();
                      setFadeOutIntro(Number(event.target.value));
                    }}
                    sx={{ minWidth: 120 }}
                    SelectProps={{ native: true }}
                  >
                    {FADE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </TextField>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        )}

        {step === 3 && (
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={600}>
              生成中
            </Typography>

            {!project ? (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={2} alignItems="center" sx={{ py: 3 }}>
                    <RocketLaunchIcon sx={{ fontSize: 48, color: 'primary.main' }} aria-hidden />
                    <Typography fontWeight={600}>确认后开始生成播客</Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
                      <Chip label={`${pickedBooks.length} 本书`} />
                      <Chip label={selectedTemplate.label} />
                      <Chip label={selectedPreset.name} />
                      <Chip label="双人对谈" />
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
              <Stack spacing={1.5}>
                {progress < 100 && progress > 0 && <Loading label="生成中..." />}
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    状态：{project.status} · 进度：{Math.round(progress)}%
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
                    {events.slice(-10).reverse().map((event, index) => (
                      <Typography key={index} variant="caption" component="div" color="text.secondary">
                        {new Date(event.timestamp).toLocaleTimeString()} · {event.stage} · {event.message}
                      </Typography>
                    ))}
                  </Box>
                )}
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button variant="contained" onClick={() => navigate(`/projects/${project.id}`)}>
                    打开项目
                  </Button>
                  <Button variant="outlined" startIcon={<SaveIcon />} onClick={() => navigate('/dashboard')}>
                    返回仪表盘
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        )}
      </Paper>

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        spacing={1}
        sx={{
          ...(isMobile
            ? {
                position: 'sticky',
                bottom: 0,
                zIndex: 10,
                bgcolor: 'background.paper',
                borderTop: 1,
                borderColor: 'divider',
                py: 1,
              }
            : {}),
        }}
      >
        <Button startIcon={<ArrowBackIcon />} onClick={goPrev} disabled={step === 1 || submitting}>
          {t('common.prev')}
        </Button>
        <Typography variant="caption" color="text.secondary">
          第 {step} / {STEPS.length} 步
        </Typography>
        {!isFinalStep ? (
          <Button
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            onClick={goNext}
            disabled={submitting || resolving}
          >
            {t('common.next')}
          </Button>
        ) : (
          <Button
            variant="contained"
            endIcon={project ? <SaveIcon /> : <RocketLaunchIcon />}
            onClick={project ? () => navigate(`/projects/${project.id}`) : () => void handleCreate()}
            disabled={submitting}
          >
            {project ? '查看项目' : t('common.startGenerate')}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
