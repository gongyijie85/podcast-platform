import { useEffect, useState, useCallback, useRef, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Stack,
  Typography,
  Paper,
  Chip,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  LinearProgress,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  Alert,
  TextField,
} from '@mui/material';
import { Button } from '../components/common/Button';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import LinkIcon from '@mui/icons-material/Link';
import CancelIcon from '@mui/icons-material/Cancel';
import { Waveform } from '../components/player/Waveform';
import { SubtitleOverlay } from '../components/player/SubtitleOverlay';
import { StepIndicator } from '../components/progress/StepIndicator';
import { Loading } from '../components/common/Loading';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { projectApi } from '../api/project.api';
import { scriptApi } from '../api/script.api';
import { exportApi } from '../api/export.api';
import { useProgress } from '../hooks/useProgress';
import { useUiStore } from '../store/ui.store';
import { useProjectStore } from '../store/project.store';
import { useConfigStore } from '../store/config.store';
import { ENV } from '../constants/env';
import { downloadFromUrl } from '../utils/download';
import { formatMs, formatTime, formatPercent } from '../utils/format';
import type { ProjectDto, RevisionPreset, ScriptTemplate } from '@shared/project';
import type { ScriptDto, ScriptSegmentDto } from '@shared/script';
import type { BgmTrackDto } from '@shared/book';

const STATUS_COLOR: Record<ProjectDto['status'], 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info'> = {
  draft: 'default',
  generating: 'primary',
  done: 'success',
  failed: 'error',
  cancelled: 'warning',
  partial: 'info',
};

const STATUS_LABEL: Record<ProjectDto['status'], string> = {
  draft: '草稿',
  generating: '生成中',
  done: '已完成',
  failed: '失败',
  cancelled: '已取消',
  partial: '部分完成',
};

const PIPELINE_STEPS = [
  { key: 'book', label: '元数据' },
  { key: 'script', label: '脚本' },
  { key: 'tts', label: 'TTS' },
  { key: 'subtitle', label: '字幕' },
  { key: 'mix', label: '合成' },
] as const;

const DOWNLOAD_OPTIONS: Array<{ format: 'mp3' | 'srt' | 'vtt' | 'txt' | 'pdf' | 'zip'; label: string }> = [
  { format: 'mp3', label: '播客音频 MP3' },
  { format: 'txt', label: 'AI 文稿 TXT' },
  { format: 'pdf', label: 'AI 文稿 PDF' },
  { format: 'srt', label: '字幕 SRT' },
  { format: 'vtt', label: '字幕 VTT' },
  { format: 'zip', label: '全部素材 ZIP' },
];

const REVISION_PRESETS: Array<{ id: RevisionPreset; label: string }> = [
  { id: 'deeper', label: '更深入' },
  { id: 'less-filler', label: '少口头禅' },
  { id: 'lighter', label: '更轻松' },
  { id: 'shorter', label: '缩短到 8 分钟' },
  { id: 'more-cross-book', label: '加强跨书比较' },
];

export function ProjectDetail(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const push = useUiStore((s) => s.push);
  const setCurrent = useProjectStore((s) => s.setCurrentProject);
  const current = useProjectStore((s) => s.currentProject);
  const subtitleStyle = useConfigStore((s) => s.subtitleStyle);
  const setSubtitleStyle = useConfigStore((s) => s.setSubtitleStyle);

  const [tab, setTab] = useState(0);
  const [project, setProject] = useState<ProjectDto | null>(current);
  const [script, setScript] = useState<ScriptDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [bgmTracks, setBgmTracks] = useState<BgmTrackDto[]>([]);
  const [editingScript, setEditingScript] = useState(false);
  const [draftScript, setDraftScript] = useState('');
  const [savingScript, setSavingScript] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [customRevision, setCustomRevision] = useState('');
  const [regeneratingPreset, setRegeneratingPreset] = useState<RevisionPreset | 'custom' | 'default' | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const projectId = id ?? project?.id ?? null;
  const { progress: liveProgress, stage: liveStage, message: liveMessage } = useProgress(projectId);

  // load project
  useEffect(() => {
    if (!id) {
      navigate('/projects', { replace: true });
      return;
    }
    let cancel = false;
    void (async () => {
      setLoading(true);
      try {
        const p = await projectApi.get(id);
        if (cancel) return;
        setProject(p);
        setCurrent(p);
        if (p.audioUrl) {
          setAudioUrl(p.audioUrl.startsWith('http') ? p.audioUrl : `${ENV.apiBaseUrl}${p.audioUrl}`);
        } else {
          setAudioUrl(exportApi.audioUrl(id));
        }
        // script
        const s = await scriptApi.get(id).catch(() => null);
        if (!cancel && s) {
          setScript(s);
          setDraftScript(s.rawText || JSON.stringify(s.segments ?? []));
        }
        // bgm tracks
        const { bgmApi } = await import('../api/bgm.api');
        const tracks = await bgmApi.list().catch(() => []);
        if (!cancel) setBgmTracks(tracks as BgmTrackDto[]);
      } catch (e) {
        push(`加载项目失败: ${(e as Error).message}`, 'error');
        navigate('/projects', { replace: true });
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [id, navigate, push, setCurrent]);

  // poll while generating
  useEffect(() => {
    if (!project || project.status !== 'generating' || !id) return;
    const t = setInterval(async () => {
      try {
        const p = await projectApi.get(id);
        setProject(p);
        setCurrent(p);
        if (p.status === 'done') {
          clearInterval(t);
          push('生成完成！', 'success');
        } else if (p.status === 'failed') {
          clearInterval(t);
          push('生成失败', 'error');
        }
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [project, id, push, setCurrent]);

  const onRefresh = useCallback(async (): Promise<void> => {
    if (!id) return;
    setRefreshing(true);
    try {
      const p = await projectApi.get(id);
      setProject(p);
      setCurrent(p);
    } catch (e) {
      push(`刷新失败: ${(e as Error).message}`, 'error');
    } finally {
      setRefreshing(false);
    }
  }, [id, push, setCurrent]);

  const onSaveScript = useCallback(async (): Promise<void> => {
    if (!project || !id) return;
    setSavingScript(true);
    try {
      const segments: ScriptSegmentDto[] = (script?.segments ?? []).map((s, i) => ({
        ...s,
        text: draftScript,
        orderIndex: i,
      }));
      await scriptApi.save(id, {
        content: JSON.stringify({ raw: draftScript }),
        rawText: draftScript,
        segments: (script?.segments ?? []).map((s, i) => ({
          id: s.id,
          orderIndex: i,
          speaker: s.speaker,
          text: draftScript,
          emotion: s.emotion,
          stage: s.stage,
        })),
      });
      push(t('projectDetail.scriptSaved'), 'success');
      setEditingScript(false);
      const fresh = await scriptApi.get(id).catch(() => null);
      if (fresh) setScript(fresh);
      void segments;
    } catch (e) {
      push(`保存失败: ${(e as Error).message}`, 'error');
    } finally {
      setSavingScript(false);
    }
  }, [project, id, draftScript, script, push, t]);

  const triggerRegenerate = useCallback(async (
    revisionPreset?: RevisionPreset,
    customInstruction?: string,
  ): Promise<void> => {
    if (!id) return;
    const marker = revisionPreset ?? (customInstruction ? 'custom' : 'default');
    setRegeneratingPreset(marker);
    try {
      await projectApi.regenerate(id, {
        scriptTemplate: (project?.scriptTemplate ?? 'audio-overview') as ScriptTemplate,
        revisionPreset,
        customInstruction: customInstruction?.trim() || undefined,
      });
      push(revisionPreset || customInstruction ? '已触发脚本返修' : '已触发重新生成', 'info');
      setConfirmRegen(false);
      const p = await projectApi.get(id).catch(() => null);
      if (p) {
        setProject(p);
        setCurrent(p);
      }
    } catch (e) {
      push(`重新生成失败: ${(e as Error).message}`, 'error');
    } finally {
      setRegeneratingPreset(null);
    }
  }, [id, project?.scriptTemplate, push, setCurrent]);

  const onRegenerate = useCallback(async (): Promise<void> => {
    await triggerRegenerate();
  }, [triggerRegenerate]);

  const onCustomRegenerate = useCallback(async (): Promise<void> => {
    const instruction = customRevision.trim();
    if (!instruction) {
      push('请先输入返修要求', 'info');
      return;
    }
    await triggerRegenerate(undefined, instruction);
    setCustomRevision('');
  }, [customRevision, push, triggerRegenerate]);

  const onCancelProject = useCallback(async (): Promise<void> => {
    if (!id) return;
    try {
      const r = await projectApi.cancel(id);
      setProject(r.project);
      setCurrent(r.project);
      push(`已取消生成，移除 ${r.cancelled} 个队列任务`, 'success');
      setConfirmCancel(false);
    } catch (e) {
      push(`取消失败: ${(e as Error).message}`, 'error');
    }
  }, [id, push, setCurrent]);

  const onDelete = useCallback(async (): Promise<void> => {
    if (!project) return;
    try {
      await projectApi.remove(project.id);
      push(`已删除「${project.title}」`, 'success');
      setConfirmDelete(false);
      navigate('/projects');
    } catch (e) {
      push(`删除失败: ${(e as Error).message}`, 'error');
    }
  }, [project, push, navigate]);

  const onCreateShare = useCallback(async (): Promise<void> => {
    if (!project) return;
    try {
      const share = await projectApi.createShare(project.id);
      const url = share.url.startsWith('http')
        ? share.url
        : `${window.location.origin}${share.url}`;
      setShareUrl(url);
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      push('分享链接已生成并复制到剪贴板', 'success');
    } catch (e) {
      push(`分享失败: ${(e as Error).message}`, 'error');
    }
  }, [project, push]);

  const download = (format: 'mp3' | 'srt' | 'vtt' | 'txt' | 'pdf' | 'zip'): void => {
    if (!project) return;
    downloadFromUrl(exportApi.exportUrl(project.id, format), `${project.title}.${format}`);
    push(`已开始下载 ${format.toUpperCase()}`, 'success');
  };

  const toggleAudio = (): void => {
    if (!audioUrl) {
      push('暂无音频', 'info');
      return;
    }
    if (!audioRef.current) {
      const a = new Audio(audioUrl);
      a.onended = () => setPlaying(false);
      a.onerror = () => {
        setPlaying(false);
        push('音频加载失败', 'error');
      };
      audioRef.current = a;
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      void audioRef.current.play();
      setPlaying(true);
    }
  };

  if (loading) {
    return <Loading fullScreen label={t('common.loading')} />;
  }
  if (!project) {
    return (
      <Box>
        <Alert severity="warning">项目不存在或已删除</Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate('/projects')}>
          {t('common.back')}
        </Button>
      </Box>
    );
  }

  const p = project;
  const progress = p.status === 'generating' ? liveProgress || p.progress : p.progress;
  const currentStage = p.status === 'generating' ? liveStage || p.currentStage : p.currentStage;
  const statusMessage = p.status === 'generating' ? liveMessage || '处理中…' : '';

  const trackName = (id: string): string => bgmTracks.find((t) => t.id === id)?.name ?? id;
  const trackCategory = (id: string): string => bgmTracks.find((t) => t.id === id)?.category ?? '';

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Tooltip title="返回项目列表">
          <IconButton onClick={() => navigate('/projects')} aria-label="back">
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight={700} noWrap>
            {p.title}
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
            <Chip
              size="small"
              color={STATUS_COLOR[p.status]}
              label={STATUS_LABEL[p.status]}
              variant={p.status === 'generating' ? 'filled' : 'outlined'}
            />
            <Typography variant="caption" color="text.secondary">
              {formatTime(p.updatedAt)}
            </Typography>
          </Stack>
        </Box>
        <Tooltip title="刷新">
          <IconButton onClick={() => void onRefresh()} aria-label="refresh" disabled={refreshing}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="更多">
          <IconButton onClick={(e: MouseEvent<HTMLElement>) => setMenuAnchor(e.currentTarget)} aria-label="more">
            <MoreVertIcon />
          </IconButton>
        </Tooltip>
        {p.status === 'generating' && (
          <Tooltip title="取消生成">
            <IconButton onClick={() => setConfirmCancel(true)} aria-label="cancel generation" color="warning">
              <CancelIcon />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {p.status === 'generating' && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle2">生成进度</Typography>
            <Typography variant="h6" color="primary">
              {formatPercent(progress)}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.max(0, Math.min(100, progress))}
            sx={{ height: 8, borderRadius: 4 }}
          />
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {currentStage ? `当前: ${currentStage}` : '准备中'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {statusMessage}
            </Typography>
          </Stack>
        </Paper>
      )}

      {p.status === 'done' && (
        <Box sx={{ mb: 3 }}>
          <StepIndicator steps={PIPELINE_STEPS.map((s) => ({ key: s.key, label: s.label }))} current={5} />
        </Box>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v as number)} variant="scrollable" scrollButtons="auto">
          <Tab label="📚 书籍" />
          <Tab label="📝 脚本" />
          <Tab label="🎙 音色" />
          <Tab label="🎵 BGM" />
          <Tab label="🎧 音频 & 下载" />
        </Tabs>
      </Box>

      {/* Books */}
      {tab === 0 && (
        <Stack spacing={2}>
          {p.books && p.books.length > 0 ? (
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
              }}
            >
              {p.books.map((b) => (
                <Card key={b.id} variant="outlined">
                  <CardContent>
                    <Stack direction="row" spacing={2}>
                      <Avatar
                        variant="rounded"
                        src={b.coverUrl ?? undefined}
                        sx={{ width: 56, height: 80, bgcolor: 'primary.light' }}
                      >
                        <MenuBookIcon />
                      </Avatar>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="subtitle2" fontWeight={600} noWrap>
                          {b.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {b.author}
                        </Typography>
                        <Chip size="small" label={b.isbn} variant="outlined" sx={{ mt: 0.5 }} />
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : (
            <Alert severity="info">本项目未关联书籍</Alert>
          )}
        </Stack>
      )}

      {/* Script */}
      {tab === 1 && (
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight={600}>{t('projectDetail.script')}</Typography>
            {!editingScript ? (
              <Button
                size="small"
                startIcon={<EditIcon />}
                onClick={() => {
                  setEditingScript(true);
                  setDraftScript(script?.rawText ?? '');
                }}
              >
                {t('common.edit')}
              </Button>
            ) : (
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={() => setEditingScript(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  loading={savingScript}
                  onClick={() => void onSaveScript()}
                >
                  {t('projectDetail.saveScript')}
                </Button>
              </Stack>
            )}
          </Stack>
          {script?.episodeBrief && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Typography variant="subtitle1" fontWeight={700}>节目策划</Typography>
                  <Chip size="small" label="AI 深潜 brief" color="primary" variant="outlined" />
                </Stack>
                <Box>
                  <Typography variant="caption" color="text.secondary">核心问题</Typography>
                  <Typography variant="body1" fontWeight={600}>{script.episodeBrief.episodeQuestion}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">开场承诺</Typography>
                  <Typography variant="body2">{script.episodeBrief.openingPromise}</Typography>
                </Box>
                <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
                  {script.episodeBrief.bookRoles.map((item) => (
                    <Paper key={item.title} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                      <Typography variant="caption" color="text.secondary">{item.title}</Typography>
                      <Typography variant="body2">{item.role}</Typography>
                    </Paper>
                  ))}
                </Box>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  {script.episodeBrief.crossBookAngles.map((item) => (
                    <Chip key={item} size="small" label={item} />
                  ))}
                </Stack>
                <Stack spacing={0.5}>
                  {script.episodeBrief.listenerTakeaways.map((item) => (
                    <Typography key={item} variant="body2" color="text.secondary">- {item}</Typography>
                  ))}
                </Stack>
                {script.episodeBrief.sourceLimits.length > 0 && (
                  <Alert severity="info">
                    {script.episodeBrief.sourceLimits.join('；')}
                  </Alert>
                )}
              </Stack>
            </Paper>
          )}
          {script?.qualityReport && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Typography variant="subtitle1" fontWeight={700}>质量自检</Typography>
                  <Chip
                    size="small"
                    color={script.qualityReport.status === 'pass' ? 'success' : 'warning'}
                    label={script.qualityReport.status === 'pass' ? '通过' : '需关注'}
                  />
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip
                    size="small"
                    label={script.qualityReport.hasCrossBookComparison ? '已包含跨书比较' : '缺少跨书比较'}
                    color={script.qualityReport.hasCrossBookComparison ? 'success' : 'warning'}
                    variant="outlined"
                  />
                  <Chip size="small" label={`口头禅 ${script.qualityReport.fillerPhraseCount} 次`} variant="outlined" />
                </Stack>
                <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
                  {script.qualityReport.bookCoverage.map((item) => (
                    <Paper key={item.title} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Typography variant="body2" fontWeight={600}>{item.title}</Typography>
                        <Chip
                          size="small"
                          label={item.hasSubstantiveLine ? '已覆盖' : '偏弱'}
                          color={item.hasSubstantiveLine ? 'success' : 'warning'}
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        提及 {item.mentionCount} 次 · {item.summaryAvailable ? '有真实简介' : '缺少真实简介'}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
                {script.qualityReport.warnings.length > 0 ? (
                  <Alert severity="warning">
                    <Stack spacing={0.5}>
                      {script.qualityReport.warnings.map((item) => (
                        <Typography key={item} variant="body2">{item}</Typography>
                      ))}
                    </Stack>
                  </Alert>
                ) : (
                  <Alert severity="success">脚本覆盖、跨书比较和事实边界检查通过。</Alert>
                )}
              </Stack>
            </Paper>
          )}
          {script && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Typography variant="subtitle1" fontWeight={700}>快速返修</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {REVISION_PRESETS.map((preset) => (
                    <Button
                      key={preset.id}
                      size="small"
                      variant="outlined"
                      loading={regeneratingPreset === preset.id}
                      disabled={p.status === 'generating'}
                      onClick={() => void triggerRegenerate(preset.id)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    size="small"
                    fullWidth
                    label="自定义返修要求"
                    value={customRevision}
                    onChange={(event) => setCustomRevision(event.target.value)}
                    inputProps={{ maxLength: 500 }}
                  />
                  <Button
                    variant="contained"
                    loading={regeneratingPreset === 'custom'}
                    disabled={p.status === 'generating'}
                    onClick={() => void onCustomRegenerate()}
                  >
                    返修
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          )}
          {editingScript ? (
            <TextField
              multiline
              minRows={10}
              maxRows={20}
              fullWidth
              value={draftScript}
              onChange={(e) => setDraftScript(e.target.value)}
              inputProps={{ 'aria-label': 'script draft' }}
            />
          ) : script?.rawText ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                {script.rawText}
              </Typography>
            </Paper>
          ) : (
            <Alert severity="info">{t('projectDetail.notGenerated')}</Alert>
          )}

          {script?.segments && script.segments.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>分镜</Typography>
              <List>
                {script.segments.map((s) => (
                  <ListItem key={s.id} divider>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: s.speaker === 'host' ? 'primary.main' : 'secondary.main' }}>
                        {s.speaker === 'host' ? 'H' : 'G'}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip size="small" label={s.stage} />
                          <Chip size="small" label={s.emotion} variant="outlined" />
                          {typeof s.startTime === 'number' && (
                            <Typography variant="caption" color="text.secondary">
                              {formatMs(s.startTime)} - {formatMs(s.endTime ?? 0)}
                            </Typography>
                          )}
                        </Stack>
                      }
                      secondary={<Typography variant="body2" sx={{ mt: 0.5 }}>{s.text}</Typography>}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Stack>
      )}

      {/* Voices */}
      {tab === 2 && (
        <Stack spacing={2}>
          {p.voices && p.voices.length > 0 ? (
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
              }}
            >
              {p.voices.map((v) => (
                <Card key={v.id} variant="outlined">
                  <CardContent>
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <VolumeUpIcon color="primary" />
                      <Box>
                        <Typography variant="subtitle1" fontWeight={600}>
                          {v.role === 'host' ? '主持人' : '嘉宾'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {v.voiceId} · {v.provider}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : (
            <Alert severity="info">未配置音色</Alert>
          )}
        </Stack>
      )}

      {/* BGM */}
      {tab === 3 && (
        <Stack spacing={2}>
          {p.bgmConfigs && p.bgmConfigs.length > 0 ? (
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
              }}
            >
              {p.bgmConfigs.map((b) => (
                <Card key={b.id} variant="outlined">
                  <CardContent>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                      <MusicNoteIcon color="primary" />
                      <Typography variant="subtitle2" fontWeight={600}>
                        {b.segment === 'intro' ? '开场' : b.segment === 'outro' ? '片尾' : '正片'}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" fontWeight={500}>
                      {trackName(b.bgmTrackId)}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
                      <Chip size="small" label={trackCategory(b.bgmTrackId)} variant="outlined" />
                      <Chip size="small" label={`音量 ${b.volume}%`} variant="outlined" />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      渐入 {b.fadeInMs}ms · 渐出 {b.fadeOutMs}ms
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : (
            <Alert severity="info">未配置 BGM</Alert>
          )}
        </Stack>
      )}

      {/* Audio & downloads */}
      {tab === 4 && (
        <Stack spacing={3}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" fontWeight={600}>🎧 播放器</Typography>
                <Stack direction="row" spacing={1}>
                  <Tooltip title={playing ? '停止' : '播放'}>
                    <span>
                      <IconButton onClick={toggleAudio} color="primary" disabled={!audioUrl}>
                        {playing ? <StopIcon /> : <PlayArrowIcon />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Stack>
              {audioUrl ? (
                <Waveform
                  url={audioUrl}
                  onTimeUpdate={setCurrentMs}
                  seekToMs={seekTo}
                />
              ) : (
                <Alert severity="info">{t('projectDetail.notGenerated')}</Alert>
              )}
          {script?.segments && script.segments.length > 0 && audioUrl && (
            <Box sx={{ mt: 2 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                <TextField
                  type="number"
                  size="small"
                  label="字幕字号"
                  value={subtitleStyle.fontSize}
                  onChange={(e) => setSubtitleStyle({ fontSize: Number(e.target.value) })}
                  inputProps={{ min: 12, max: 28 }}
                />
                <TextField
                  type="number"
                  size="small"
                  label="字幕行距"
                  value={subtitleStyle.lineHeight}
                  onChange={(e) => setSubtitleStyle({ lineHeight: Number(e.target.value) })}
                  inputProps={{ min: 1.2, max: 2.4, step: 0.1 }}
                />
              </Stack>
              <SubtitleOverlay
                segments={script.segments}
                currentMs={currentMs}
                onSeek={(ms) => setSeekTo(ms)}
                style={{ fontSize: subtitleStyle.fontSize, lineHeight: subtitleStyle.lineHeight }}
              />
            </Box>
          )}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>⬇ 下载</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  startIcon={<LinkIcon />}
                  onClick={() => void onCreateShare()}
                  disabled={p.status !== 'done' && p.status !== 'partial'}
                >
                  生成分享链接
                </Button>
                {DOWNLOAD_OPTIONS.map((item) => (
                  <Button
                    key={item.format}
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={() => download(item.format)}
                    disabled={p.status !== 'done' && p.status !== 'partial'}
                  >
                    {item.label}
                  </Button>
                ))}
              </Box>
              {shareUrl && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  分享链接：{shareUrl}
                </Alert>
              )}
              {p.status !== 'done' && p.status !== 'partial' && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  项目生成完成后即可下载
                </Typography>
              )}
            </CardContent>
          </Card>
        </Stack>
      )}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setConfirmRegen(true);
          }}
        >
          <ListItemIcon>
            <RefreshIcon fontSize="small" />
          </ListItemIcon>
          {t('projectDetail.regenerate')}
        </MenuItem>
        {p.status === 'generating' && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              setConfirmCancel(true);
            }}
          >
            <ListItemIcon>
              <CancelIcon fontSize="small" />
            </ListItemIcon>
            取消生成
          </MenuItem>
        )}
        <Divider />
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setConfirmDelete(true);
          }}
        >
          <ListItemIcon>
            <DownloadIcon fontSize="small" color="error" />
          </ListItemIcon>
          <Typography color="error">{t('projects.delete')}</Typography>
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={confirmRegen}
        title={t('projectDetail.regenerate')}
        message="确认重新生成？将基于现有脚本与配置重新合成音频。"
        confirmText={t('projectDetail.regenerate')}
        onConfirm={onRegenerate}
        onClose={() => setConfirmRegen(false)}
      />
      <ConfirmDialog
        open={confirmCancel}
        title="取消生成"
        message="确认取消当前生成任务？已生成资源会作为草稿保留。"
        confirmText="取消生成"
        confirmColor="warning"
        onConfirm={onCancelProject}
        onClose={() => setConfirmCancel(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={t('projects.delete')}
        message={t('projects.deleteConfirm')}
        confirmText={t('projects.delete')}
        confirmColor="error"
        onConfirm={onDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </Box>
  );
}
