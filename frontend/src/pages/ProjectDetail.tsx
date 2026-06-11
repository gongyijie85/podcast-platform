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
import { Waveform } from '../components/player/Waveform';
import { SubtitleOverlay } from '../components/player/SubtitleOverlay';
import { ScriptEditor } from '../components/script/ScriptEditor';
import { StepIndicator } from '../components/progress/StepIndicator';
import { Loading } from '../components/common/Loading';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { projectApi } from '../api/project.api';
import { scriptApi } from '../api/script.api';
import { exportApi } from '../api/export.api';
import { useProgress } from '../hooks/useProgress';
import { useUiStore } from '../store/ui.store';
import { useProjectStore } from '../store/project.store';
import { ENV } from '../constants/env';
import { downloadFromUrl } from '../utils/download';
import { formatMs, formatTime, formatPercent } from '../utils/format';
import type { ProjectDto } from '@shared/project';
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

export function ProjectDetail(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const push = useUiStore((s) => s.push);
  const setCurrent = useProjectStore((s) => s.setCurrentProject);
  const current = useProjectStore((s) => s.currentProject);

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

  const onRegenerate = useCallback(async (): Promise<void> => {
    if (!id) return;
    try {
      await projectApi.regenerate(id);
      push('已触发重新生成', 'info');
      setConfirmRegen(false);
      const p = await projectApi.get(id).catch(() => null);
      if (p) {
        setProject(p);
        setCurrent(p);
      }
    } catch (e) {
      push(`重新生成失败: ${(e as Error).message}`, 'error');
    }
  }, [id, push, setCurrent]);

  const onDelete = useCallback(async (): Promise<void> => {
    if (!project) return;
    push(`「${project.title}」暂未接入删除接口`, 'info');
    setConfirmDelete(false);
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
                  <SubtitleOverlay
                    segments={script.segments}
                    currentMs={currentMs}
                    onSeek={(ms) => setSeekTo(ms)}
                  />
                </Box>
              )}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>⬇ 下载</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {(['mp3', 'srt', 'vtt', 'txt', 'pdf', 'zip'] as const).map((fmt) => (
                  <Button
                    key={fmt}
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={() => download(fmt)}
                    disabled={p.status !== 'done' && p.status !== 'partial'}
                  >
                    {fmt.toUpperCase()}
                  </Button>
                ))}
              </Box>
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
