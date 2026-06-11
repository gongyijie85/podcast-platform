import { Card, CardContent, Typography, MenuItem, Select, Stack, Slider, FormControl, InputLabel, Box, Button } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useEffect, useState } from 'react';
import { bgmApi } from '../../api/bgm.api';
import { ttsApi } from '../../api/tts.api';
import { useConfigStore } from '../../store/config.store';
import { useUiStore } from '../../store/ui.store';
import type { BgmTrackDto } from '@shared/book';

interface Props {
  segment: 'intro' | 'body' | 'outro';
  bgmTrackId: string;
  volume: number;
  fadeInMs: number;
  fadeOutMs: number;
  onChange: (patch: { bgmTrackId?: string; volume?: number; fadeInMs?: number; fadeOutMs?: number }) => void;
}

const SEG_LABELS: Record<Props['segment'], string> = {
  intro: '开场',
  body: '正片',
  outro: '片尾',
};

const FADE_OPTIONS = [
  { label: '0.5s', value: 500 },
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
];

export function BgmSegmentConfig(props: Props): JSX.Element {
  const tracks = useConfigStore((s) => s.bgmTracks);
  const setBgm = useConfigStore((s) => s.setBgm);
  const push = useUiStore((s) => s.push);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (tracks.length === 0) {
      bgmApi.list().then((list) => {
        setBgm(list as BgmTrackDto[]);
      }).catch(() => {
        setBgm([
          { id: 'bgm-relax-1', name: '春日漫步', category: '轻松', storageKey: 'bgm/relax/spring.mp3', durationMs: 180_000 },
          { id: 'bgm-tech-1', name: '数据流', category: '科技', storageKey: 'bgm/tech/data.mp3', durationMs: 220_000 },
          { id: 'bgm-human-1', name: '远山', category: '人文', storageKey: 'bgm/human/far.mp3', durationMs: 230_000 },
        ]);
      });
    }
  }, [tracks.length, setBgm]);

  const filtered = tracks.filter((t) => {
    if (props.segment === 'intro') return t.category === '轻松';
    if (props.segment === 'body') return t.category === '科技' || t.category === '人文';
    return t.category === '人文' || t.category === '纪实';
  });
  const list = filtered.length > 0 ? filtered : tracks;

  const handlePreview = async (): Promise<void> => {
    setPreviewing(true);
    try {
      // Use TTS preview as audible placeholder (mock mode)
      const r = await ttsApi.preview('BV001_streaming', `${SEG_LABELS[props.segment]} BGM 试听中...`);
      const a = new Audio(r.url);
      a.onended = () => setPreviewing(false);
      a.onerror = () => setPreviewing(false);
      await a.play();
    } catch (e) {
      push(`试听失败: ${(e as Error).message}`, 'error');
      setPreviewing(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ mb: 1.5 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <Typography variant="subtitle1" fontWeight={600} sx={{ width: 60 }}>
            {SEG_LABELS[props.segment]}
          </Typography>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>曲目</InputLabel>
            <Select
              label="曲目"
              value={props.bgmTrackId}
              onChange={(e) => props.onChange({ bgmTrackId: e.target.value as string })}
            >
              {list.map((t) => (
                <MenuItem key={t.id} value={t.id}>{t.name} · {t.category}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ minWidth: 160, flex: 1 }}>
            <Typography variant="caption">音量 {props.volume}%</Typography>
            <Slider
              size="small"
              value={props.volume}
              min={0}
              max={100}
              onChange={(_, v) => props.onChange({ volume: typeof v === 'number' ? v : v[0] })}
            />
          </Box>
          <FormControl size="small" sx={{ minWidth: 80 }}>
            <InputLabel>渐入</InputLabel>
            <Select
              label="渐入"
              value={props.fadeInMs}
              onChange={(e) => props.onChange({ fadeInMs: e.target.value as number })}
            >
              {FADE_OPTIONS.map((f) => (
                <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 80 }}>
            <InputLabel>渐出</InputLabel>
            <Select
              label="渐出"
              value={props.fadeOutMs}
              onChange={(e) => props.onChange({ fadeOutMs: e.target.value as number })}
            >
              {FADE_OPTIONS.map((f) => (
                <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button size="small" startIcon={<PlayArrowIcon />} disabled={previewing} onClick={handlePreview}>
            试听
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
