import { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Stack, ToggleButton, ToggleButtonGroup, Paper, Typography, IconButton, Tooltip } from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import { useDebounce } from '../../hooks/useDebounce';

interface Props {
  value: string;
  onChange: (text: string) => void;
  minRows?: number;
  showToolbar?: boolean;
  placeholder?: string;
  autoSaveDelay?: number;
}

/**
 * Lightweight rich-text-style editor. We avoid pulling in Monaco/TipTap here
 * (they are heavy and not needed for short podcast scripts). Instead we use a
 * textarea with line numbers, simple formatting hints (bold/italic/list), and
 * undo/redo via a history stack.
 *
 * The component is fully controlled: it expects a `value` string and fires
 * `onChange` on every edit. A debounced auto-save callback can be implemented
 * by the parent using `useDebounce`.
 */
export function ScriptEditor({
  value,
  onChange,
  minRows = 12,
  showToolbar = true,
  placeholder = '在这里撰写您的播客脚本...\n使用 主持人: ... 嘉宾: ... 来标记角色。',
  autoSaveDelay = 1500,
}: Props): JSX.Element {
  const [internal, setInternal] = useState(value);
  const historyRef = useRef<string[]>([value]);
  const historyIdxRef = useRef(0);
  const debounced = useDebounce(internal, autoSaveDelay);

  // keep internal in sync if parent changes value (e.g. project switch)
  useEffect(() => {
    setInternal(value);
  }, [value]);

  // notify parent of debounced changes (autosave)
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const lines = useMemo(() => internal.split('\n'), [internal]);

  const pushHistory = (next: string): void => {
    const hist = historyRef.current.slice(0, historyIdxRef.current + 1);
    hist.push(next);
    if (hist.length > 100) hist.shift();
    historyRef.current = hist;
    historyIdxRef.current = hist.length - 1;
  };

  const update = (next: string): void => {
    setInternal(next);
    pushHistory(next);
  };

  const wrap = (left: string, right: string): void => {
    const el = document.getElementById('script-editor-textarea') as HTMLTextAreaElement | null;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const sel = internal.slice(start, end);
    const next = internal.slice(0, start) + left + sel + right + internal.slice(end);
    update(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + left.length, end + left.length);
    });
  };

  const undo = (): void => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    setInternal(historyRef.current[historyIdxRef.current]);
  };

  const redo = (): void => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    setInternal(historyRef.current[historyIdxRef.current]);
  };

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      {showToolbar && (
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ p: 0.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}
          alignItems="center"
        >
          <ToggleButtonGroup size="small" exclusive>
            <ToggleButton value="bold" onClick={() => wrap('**', '**')} aria-label="bold">
              <FormatBoldIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="italic" onClick={() => wrap('*', '*')} aria-label="italic">
              <FormatItalicIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="list" onClick={() => wrap('\n- ', '')} aria-label="list">
              <FormatListBulletedIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="撤销 (Ctrl+Z)">
            <span>
              <IconButton size="small" onClick={undo} aria-label="undo">
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="重做 (Ctrl+Shift+Z)">
            <span>
              <IconButton size="small" onClick={redo} aria-label="redo">
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      )}

      <Stack direction="row" sx={{ position: 'relative' }}>
        {/* gutter with line numbers */}
        <Box
          aria-hidden
          sx={{
            bgcolor: 'grey.50',
            color: 'text.secondary',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            lineHeight: 1.6,
            px: 1,
            py: 1.5,
            borderRight: '1px solid',
            borderColor: 'divider',
            userSelect: 'none',
            textAlign: 'right',
            minWidth: 36,
          }}
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </Box>

        <textarea
          id="script-editor-textarea"
          value={internal}
          onChange={(e) => update(e.target.value)}
          placeholder={placeholder}
          rows={Math.max(minRows, lines.length)}
          spellCheck={false}
          aria-label="script content"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            resize: 'vertical',
            padding: '12px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            lineHeight: 1.6,
            minHeight: 240,
            background: 'transparent',
            color: 'inherit',
          }}
        />
      </Stack>

      <Box
        sx={{
          px: 1.5,
          py: 0.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'grey.50',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {internal.length} chars · {lines.length} lines · auto-save {autoSaveDelay}ms
        </Typography>
      </Box>
    </Paper>
  );
}
