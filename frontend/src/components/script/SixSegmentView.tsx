import { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Stack,
  Paper,
  Typography,
  TextField,
  IconButton,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Button,
  Tooltip,
  type SelectChangeEvent,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { EMOTIONS } from '../../constants/emotions';
import type { ScriptEmotion, ScriptStage, Speaker } from '@shared/script';

export interface SixSegmentItem {
  id: string;
  speaker: Speaker;
  text: string;
  emotion: ScriptEmotion;
  stage: ScriptStage;
}

interface Props {
  value: SixSegmentItem[];
  onChange: (next: SixSegmentItem[]) => void;
  readOnly?: boolean;
}

const STAGES: Array<{ key: ScriptStage; title: string; color: string; description: string }> = [
  { key: 'intro', title: '① 开头', color: '#6366f1', description: '开场白 + 自我介绍' },
  { key: 'introduce', title: '② 发展', color: '#10b981', description: '引入书籍背景' },
  { key: 'interpret', title: '③ 高潮', color: '#ef4444', description: '深度解读核心观点' },
  { key: 'review', title: '④ 转折', color: '#f59e0b', description: '正反观点对照' },
  { key: 'suggest', title: '⑤ 结局', color: '#8b5cf6', description: '总结 + 行动建议' },
  { key: 'closing', title: '⑥ 结尾', color: '#ec4899', description: '感谢 + 下期预告' },
];

const NEW_ID = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emotionColor = (e: ScriptEmotion): string => EMOTIONS.find((x) => x.key === e)?.color ?? '#94a3b8';
const emotionEmoji = (e: ScriptEmotion): string => EMOTIONS.find((x) => x.key === e)?.emoji ?? '🎙';
/**
 * Returns a safe emotion key for MUI Select. If the AI prompt ever produces
 * an emotion string that is not in the `EMOTIONS` whitelist (e.g. `'兴奋'`),
 * we fall back to the first whitelisted emotion. This keeps MUI Select from
 * emitting a `value not in MenuItem list` warning and prevents a runtime
 * crash if the renderer ever switches to a strict mode.
 */
const safeEmotion = (e: ScriptEmotion): ScriptEmotion =>
  EMOTIONS.some((x) => x.key === e) ? e : EMOTIONS[0].key;

/**
 * Six-segment script view: 开头 / 发展 / 高潮 / 转折 / 结局 / 结尾.
 * Renders the segments grouped by stage with per-row speaker, emotion, and text.
 * Drag-and-drop reordering is implemented via simple up/down controls.
 */
export function SixSegmentView({ value, onChange, readOnly = false }: Props): JSX.Element {
  const [dragging, setDragging] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const m = new Map<ScriptStage, SixSegmentItem[]>();
    STAGES.forEach((s) => m.set(s.key, []));
    value.forEach((it) => m.get(it.stage)?.push(it));
    return m;
  }, [value]);

  const update = useCallback(
    (id: string, patch: Partial<SixSegmentItem>): void => {
      onChange(value.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    },
    [value, onChange],
  );

  const remove = useCallback(
    (id: string): void => onChange(value.filter((it) => it.id !== id)),
    [value, onChange],
  );

  const add = useCallback(
    (stage: ScriptStage, speaker: Speaker): void => {
      onChange([
        ...value,
        {
          id: NEW_ID(),
          speaker,
          text: '',
          emotion: '平缓',
          stage,
        },
      ]);
    },
    [value, onChange],
  );

  const move = useCallback(
    (id: string, dir: -1 | 1): void => {
      const idx = value.findIndex((it) => it.id === id);
      if (idx < 0) return;
      const target = idx + dir;
      if (target < 0 || target >= value.length) return;
      const next = value.slice();
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      onChange(next);
    },
    [value, onChange],
  );

  // Drag-and-drop with HTML5 DnD
  const onDragStart = (id: string) => (e: React.DragEvent<HTMLDivElement>): void => {
    setDragging(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (targetId: string) => (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    setDragging(null);
    if (!sourceId || sourceId === targetId) return;
    const src = value.findIndex((it) => it.id === sourceId);
    const dst = value.findIndex((it) => it.id === targetId);
    if (src < 0 || dst < 0) return;
    const next = value.slice();
    const [item] = next.splice(src, 1);
    next.splice(dst, 0, item);
    onChange(next);
  };

  return (
    <Stack spacing={2}>
      {STAGES.map((stage) => {
        const items = grouped.get(stage.key) ?? [];
        return (
          <Paper key={stage.key} variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box
              sx={{
                px: 2,
                py: 1,
                bgcolor: stage.color,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  {stage.title}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  {stage.description}
                </Typography>
              </Box>
              {!readOnly && (
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="contained"
                    color="inherit"
                    onClick={() => add(stage.key, 'host')}
                    startIcon={<AddIcon />}
                    sx={{ color: stage.color, bgcolor: 'white', '&:hover': { bgcolor: 'grey.100' } }}
                  >
                    主持人
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color="inherit"
                    onClick={() => add(stage.key, 'guest')}
                    startIcon={<AddIcon />}
                    sx={{ color: stage.color, bgcolor: 'white', '&:hover': { bgcolor: 'grey.100' } }}
                  >
                    嘉宾
                  </Button>
                </Stack>
              )}
            </Box>
            <Stack spacing={1.5} sx={{ p: 2 }}>
              {items.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  还没有台词，点击右上角添加。
                </Typography>
              ) : (
                items.map((it) => (
                  <Stack
                    key={it.id}
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={1.5}
                    alignItems={{ md: 'center' }}
                    draggable={!readOnly}
                    onDragStart={onDragStart(it.id)}
                    onDragOver={onDragOver}
                    onDrop={onDrop(it.id)}
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: dragging === it.id ? 'primary.main' : 'divider',
                      bgcolor: 'background.paper',
                      opacity: dragging === it.id ? 0.6 : 1,
                    }}
                  >
                    {!readOnly && (
                      <Stack direction="row" alignItems="center" sx={{ cursor: 'grab' }}>
                        <DragIndicatorIcon fontSize="small" color="action" />
                      </Stack>
                    )}

                    <Chip
                      size="small"
                      label={it.speaker === 'host' ? '主持人' : '嘉宾'}
                      color={it.speaker === 'host' ? 'primary' : 'secondary'}
                      sx={{ minWidth: 60 }}
                    />

                    <FormControl size="small" sx={{ minWidth: 120 }}>
                      <Select
                        value={safeEmotion(it.emotion)}
                        onChange={(e: SelectChangeEvent<ScriptEmotion>) =>
                          update(it.id, { emotion: e.target.value as ScriptEmotion })
                        }
                        aria-label="emotion"
                      >
                        {EMOTIONS.map((e) => (
                          <MenuItem key={e.key} value={e.key}>
                            <Box component="span" sx={{ mr: 1 }}>{e.emoji}</Box>
                            {e.key}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <TextField
                      size="small"
                      multiline
                      maxRows={4}
                      fullWidth
                      value={it.text}
                      onChange={(e) => update(it.id, { text: e.target.value })}
                      disabled={readOnly}
                      placeholder="台词内容..."
                      inputProps={{ 'aria-label': 'segment text' }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderLeft: `3px solid ${emotionColor(it.emotion)}`,
                        },
                      }}
                    />

                    {!readOnly && (
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="上移">
                          <span>
                            <IconButton size="small" onClick={() => move(it.id, -1)} aria-label="move up">
                              ↑
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="下移">
                          <span>
                            <IconButton size="small" onClick={() => move(it.id, 1)} aria-label="move down">
                              ↓
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="删除">
                          <IconButton size="small" color="error" onClick={() => remove(it.id)} aria-label="delete">
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    )}
                  </Stack>
                ))
              )}
            </Stack>
          </Paper>
        );
      })}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">
          {value.length} 段 · {value.filter((v) => v.text.trim()).length} 已写 · 拖拽或使用 ↑↓ 重新排序
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ color: 'primary.main' }}>
          {value.filter((v) => v.speaker === 'host').length} 主持人 / {value.filter((v) => v.speaker === 'guest').length} 嘉宾
        </Typography>
      </Box>
    </Stack>
  );
}
