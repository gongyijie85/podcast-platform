import { useEffect, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { formatMs } from '../../utils/format';
import type { ScriptSegmentDto } from '@shared/script';

interface Props {
  segments: ScriptSegmentDto[];
  currentMs: number;
  onSeek?: (ms: number) => void;
  fontSize?: number;
  style?: {
    fontSize?: number;
    lineHeight?: number;
  };
}

export function SubtitleOverlay({ segments, currentMs, onSeek, fontSize = 14, style }: Props): JSX.Element {
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const resolvedFontSize = style?.fontSize ?? fontSize;
  const resolvedLineHeight = style?.lineHeight ?? 1.6;

  useEffect(() => {
    const idx = segments.findIndex(
      (s) => (s.startTime ?? 0) <= currentMs && currentMs < (s.endTime ?? Number.POSITIVE_INFINITY),
    );
    setActiveIdx(idx);
  }, [currentMs, segments]);

  return (
    <Stack
      spacing={0.5}
      sx={{
        maxHeight: 200,
        overflowY: 'auto',
        bgcolor: 'rgba(0,0,0,0.04)',
        borderRadius: 1,
        p: 1,
        lineHeight: resolvedLineHeight,
      }}
    >
      {segments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">暂无字幕</Typography>
      ) : (
        segments.map((s, i) => {
          const isActive = i === activeIdx;
          return (
            <Box
              key={s.id}
              onClick={() => onSeek?.(s.startTime ?? 0)}
              sx={{
                cursor: 'pointer',
                px: 1,
                py: 0.5,
                borderRadius: 1,
                bgcolor: isActive ? 'primary.light' : 'transparent',
                color: isActive ? 'white' : 'text.primary',
                fontSize: resolvedFontSize,
                transition: 'all 0.15s',
                fontWeight: isActive ? 600 : 400,
                '&:hover': { bgcolor: isActive ? 'primary.light' : 'rgba(0,0,0,0.06)' },
              }}
            >
              <Typography component="span" sx={{ fontSize: 'inherit', opacity: 0.7, mr: 1 }}>
                {s.speaker === 'host' ? '主持人' : '嘉宾'}：
              </Typography>
              {s.text}
              <Typography component="span" sx={{ fontSize: 'inherit', opacity: 0.6, ml: 1 }}>
                [{s.emotion}]
              </Typography>
              <Typography component="span" sx={{ fontSize: 10, opacity: 0.5, ml: 1 }}>
                {formatMs(s.startTime ?? 0)}
              </Typography>
            </Box>
          );
        })
      )}
    </Stack>
  );
}
