import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Box, Stack, IconButton, Slider, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { formatMs } from '../../utils/format';

interface Props {
  url: string;
  onTimeUpdate?: (currentMs: number) => void;
  seekToMs?: number | null;
  height?: number;
}

export function Waveform({ url, onTimeUpdate, seekToMs, height = 80 }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(0.75);

  useEffect(() => {
    if (!containerRef.current) return;
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#cbd5e1',
      progressColor: '#6366f1',
      cursorColor: '#4f46e5',
      barWidth: 2,
      barRadius: 2,
      height,
      url,
    });
    wavesurfer.current = ws;
    ws.on('ready', () => {
      setDuration(ws.getDuration() * 1000);
      ws.setVolume(volume);
    });
    ws.on('timeupdate', (t) => {
      setPosition(t * 1000);
      onTimeUpdate?.(t * 1000);
    });
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));
    return () => {
      ws.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // External seek
  useEffect(() => {
    if (seekToMs == null || !wavesurfer.current || duration === 0) return;
    wavesurfer.current.seekTo(seekToMs / duration);
  }, [seekToMs, duration]);

  const togglePlay = (): void => {
    wavesurfer.current?.playPause();
  };

  return (
    <Box>
      <Box ref={containerRef} sx={{ width: '100%' }} />
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
        <IconButton onClick={togglePlay} color="primary">
          {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
        <Typography variant="body2" sx={{ minWidth: 90 }}>
          {formatMs(position)} / {formatMs(duration)}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <VolumeUpIcon fontSize="small" />
        <Slider
          size="small"
          value={volume}
          min={0}
          max={1}
          step={0.05}
          onChange={(_, v) => {
            const n = typeof v === 'number' ? v : v[0];
            setVolume(n);
            wavesurfer.current?.setVolume(n);
          }}
          sx={{ width: 120 }}
        />
      </Stack>
    </Box>
  );
}
