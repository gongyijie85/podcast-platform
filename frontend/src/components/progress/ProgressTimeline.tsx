import { Box, Stack, Typography, LinearProgress, Paper, Chip } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { formatMs } from '../../utils/format';
import type { ProgressEvent } from '@shared/job';
import type { GenerationStage } from '@shared/project';

interface Props {
  events: ProgressEvent[];
  currentProgress: number;
  currentStage: GenerationStage | null;
  currentMessage: string;
  estimatedRemainingMs?: number;
}

const STAGE_LABELS: Record<GenerationStage, string> = {
  metadata: '拉取书籍信息',
  script: '生成脚本',
  tts: 'TTS 语音合成',
  subtitle: '生成字幕',
  mix: '音频合成',
};

const STAGE_COLOR: Record<GenerationStage, string> = {
  metadata: '#6366f1',
  script: '#10b981',
  tts: '#f59e0b',
  subtitle: '#8b5cf6',
  mix: '#ec4899',
};

const STAGE_ORDER: GenerationStage[] = ['metadata', 'script', 'tts', 'subtitle', 'mix'];

/**
 * Visual timeline of the generation pipeline. Shows the current stage, an
 * overall progress bar, the latest event message, and a log of recent events.
 */
export function ProgressTimeline({
  events,
  currentProgress,
  currentStage,
  currentMessage,
  estimatedRemainingMs,
}: Props): JSX.Element {
  const currentIdx = currentStage ? STAGE_ORDER.indexOf(currentStage) : -1;

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            生成进度
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            {currentStage && (
              <Chip
                size="small"
                label={STAGE_LABELS[currentStage]}
                sx={{ bgcolor: STAGE_COLOR[currentStage], color: 'white' }}
              />
            )}
            <Typography variant="h6" color="primary" sx={{ minWidth: 64, textAlign: 'right' }}>
              {Math.max(0, Math.min(100, Math.round(currentProgress)))}%
            </Typography>
          </Stack>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={Math.max(0, Math.min(100, currentProgress))}
          sx={{ height: 10, borderRadius: 5 }}
        />
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {currentMessage || '等待中…'}
          </Typography>
          {typeof estimatedRemainingMs === 'number' && estimatedRemainingMs > 0 && (
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary' }}>
              <AccessTimeIcon fontSize="small" />
              <Typography variant="caption">预计 {formatMs(estimatedRemainingMs)}</Typography>
            </Stack>
          )}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
          流水线
        </Typography>
        <Stack spacing={1}>
          {STAGE_ORDER.map((s, i) => {
            const isDone = i < currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <Stack
                key={s}
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{
                  p: 1,
                  borderRadius: 1,
                  bgcolor: isCurrent ? `${STAGE_COLOR[s]}15` : 'transparent',
                  color: isDone || isCurrent ? 'text.primary' : 'text.disabled',
                }}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    bgcolor: isDone ? 'success.main' : isCurrent ? STAGE_COLOR[s] : 'grey.300',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {isDone ? '✓' : isCurrent ? '●' : i + 1}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={isCurrent ? 600 : 500}>
                    {STAGE_LABELS[s]}
                  </Typography>
                </Box>
                {isCurrent && (
                  <Typography variant="caption" color="primary">
                    进行中
                  </Typography>
                )}
                {isDone && (
                  <Typography variant="caption" color="success.main">
                    完成
                  </Typography>
                )}
              </Stack>
            );
          })}
        </Stack>
      </Paper>

      {events.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, maxHeight: 200, overflowY: 'auto' }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            事件日志
          </Typography>
          <Stack spacing={0.5}>
            {events.slice(-20).reverse().map((e, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center" sx={{ fontSize: 12 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ minWidth: 64, fontFamily: 'monospace' }}
                >
                  {new Date(e.timestamp).toLocaleTimeString()}
                </Typography>
                <Chip
                  size="small"
                  label={STAGE_LABELS[e.stage]}
                  sx={{ bgcolor: STAGE_COLOR[e.stage], color: 'white', height: 18, fontSize: 10 }}
                />
                <Typography variant="caption" sx={{ flex: 1 }} noWrap>
                  {e.message}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36, textAlign: 'right' }}>
                  {Math.max(0, Math.min(100, Math.round(e.progress)))}%
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
