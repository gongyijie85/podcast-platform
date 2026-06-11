import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  Tooltip,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import { bgmApi } from '../../api/bgm.api';
import { useConfigStore } from '../../store/config.store';
import { useUiStore } from '../../store/ui.store';
import { formatMs } from '../../utils/format';
import type { BgmTrackDto } from '@shared/book';

interface Props {
  value: string;
  segment: 'intro' | 'body' | 'outro';
  onChange: (trackId: string) => void;
  volume?: number;
  onVolumeChange?: (v: number) => void;
}

const SEG_LABELS: Record<Props['segment'], string> = {
  intro: '开场 BGM',
  body: '正片 BGM',
  outro: '片尾 BGM',
};

const SEG_COLOR: Record<Props['segment'], string> = {
  intro: '#6366f1',
  body: '#10b981',
  outro: '#ec4899',
};

const CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: '轻松', label: '轻松' },
  { key: '科技', label: '科技' },
  { key: '人文', label: '人文' },
  { key: '纪实', label: '纪实' },
];

/**
 * Background-music picker. Loads the track list from /api/bgm/tracks (with
 * a hard-coded fallback), filters by category, and exposes a small inline
 * preview (clicking the play icon uses the audio previewUrl when available).
 */
export function BGMPicker({ value, segment, onChange, volume = 30, onVolumeChange }: Props): JSX.Element {
  const tracks = useConfigStore((s) => s.bgmTracks);
  const setTracks = useConfigStore((s) => s.setBgm);
  const push = useUiStore((s) => s.push);
  const [category, setCategory] = useState<string>('all');
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    if (tracks.length === 0) {
      bgmApi
        .list()
        .then((list) => setTracks(list as BgmTrackDto[]))
        .catch(() => {
          // fallback tracks
          setTracks([
            { id: 'bgm-relax-1', name: '春日漫步', category: '轻松', storageKey: 'bgm/relax/spring.mp3', durationMs: 180_000 },
            { id: 'bgm-relax-2', name: '午后阳光', category: '轻松', storageKey: 'bgm/relax/afternoon.mp3', durationMs: 200_000 },
            { id: 'bgm-tech-1', name: '数据流', category: '科技', storageKey: 'bgm/tech/data.mp3', durationMs: 220_000 },
            { id: 'bgm-tech-2', name: '电路城市', category: '科技', storageKey: 'bgm/tech/circuit.mp3', durationMs: 240_000 },
            { id: 'bgm-human-1', name: '远山', category: '人文', storageKey: 'bgm/human/far.mp3', durationMs: 230_000 },
            { id: 'bgm-human-2', name: '书香门第', category: '人文', storageKey: 'bgm/human/books.mp3', durationMs: 210_000 },
            { id: 'bgm-doc-1', name: '时光机', category: '纪实', storageKey: 'bgm/doc/time.mp3', durationMs: 250_000 },
          ]);
        });
    }
  }, [tracks.length, setTracks]);

  const visible = category === 'all' ? tracks : tracks.filter((t) => t.category === category);

  const preview = (t: BgmTrackDto): void => {
    if (previewing === t.id) {
      audio?.pause();
      setPreviewing(null);
      return;
    }
    if (!t.url) {
      push(`「${t.name}」暂无试听地址`, 'info');
      return;
    }
    audio?.pause();
    const a = new Audio(t.url);
    a.onended = () => setPreviewing(null);
    a.onerror = () => {
      setPreviewing(null);
      push('音频加载失败', 'error');
    };
    setAudio(a);
    setPreviewing(t.id);
    void a.play();
  };

  return (
    <Card variant="outlined" sx={{ borderTop: `3px solid ${SEG_COLOR[segment]}` }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            <MusicNoteIcon fontSize="small" sx={{ verticalAlign: -3, mr: 0.5 }} />
            {SEG_LABELS[segment]}
          </Typography>
          <Chip size="small" label={visible.length} color="default" />
        </Stack>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={category}
          onChange={(_, v) => v && setCategory(v)}
          sx={{ mb: 2, flexWrap: 'wrap' }}
        >
          {CATEGORIES.map((c) => (
            <ToggleButton key={c.key} value={c.key} aria-label={c.label}>
              {c.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Stack spacing={1}>
          {visible.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              暂无 BGM
            </Typography>
          )}
          {visible.map((t) => {
            const selected = t.id === value;
            return (
              <Stack
                key={t.id}
                direction="row"
                alignItems="center"
                spacing={1.5}
                sx={{
                  p: 1,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? 'primary.50' : 'transparent',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: selected ? 'primary.50' : 'grey.50' },
                }}
                onClick={() => onChange(t.id)}
              >
                <Tooltip title={previewing === t.id ? '停止' : '试听'}>
                  <IconButton
                    size="small"
                    color={previewing === t.id ? 'error' : 'default'}
                    onClick={(e) => {
                      e.stopPropagation();
                      preview(t);
                    }}
                    aria-label="preview"
                  >
                    <PlayArrowIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={selected ? 600 : 500} noWrap>
                    {t.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t.category} · {formatMs(t.durationMs)}
                  </Typography>
                </Box>
                {selected && <Chip size="small" label="已选" color="primary" />}
              </Stack>
            );
          })}
        </Stack>

        {onVolumeChange && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              BGM 音量 {volume}%
            </Typography>
            <Slider
              size="small"
              value={volume}
              min={0}
              max={100}
              onChange={(_, v) => onVolumeChange(typeof v === 'number' ? v : v[0])}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
