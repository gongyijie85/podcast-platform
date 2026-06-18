import { useState, useCallback, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Stack, TextField, Button, Chip, Typography, InputAdornment, IconButton, Tooltip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import { Input } from '../common/Input';
import { parseIsbnInput, type IsbnParseResult } from '../../utils/isbn';
import { useDebounce } from '../../hooks/useDebounce';

interface Props {
  value?: string;
  onChange?: (raw: string, parsed: IsbnParseResult[]) => void;
  onSearch?: (isbns: string[]) => void;
  placeholder?: string;
  autoSearch?: boolean;
}

/**
 * Reusable ISBN search bar. Accepts a multi-line textarea (newline / comma /
 * space separated) and validates each token. Invalid entries are highlighted
 * as chips so the user can fix typos before submitting.
 */
export function BookSearchBar({
  value = '',
  onChange,
  onSearch,
  placeholder,
  autoSearch = false,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const [raw, setRaw] = useState(value);
  const [single, setSingle] = useState('');
  const debounced = useDebounce(raw, 300);

  const parsed = parseIsbnInput(debounced);
  const valid = parsed.filter((p) => p.valid);
  const invalid = parsed.filter((p) => !p.valid);

  const update = useCallback(
    (next: string): void => {
      setRaw(next);
      onChange?.(next, parseIsbnInput(next));
    },
    [onChange],
  );

  const handleAddSingle = (): void => {
    const trimmed = single.trim();
    if (!trimmed) return;
    const next = raw ? `${raw}\n${trimmed}` : trimmed;
    update(next);
    setSingle('');
  };

  const handleSingleKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSingle();
    }
  };

  const handleSearch = (): void => {
    if (valid.length === 0) return;
    onSearch?.(valid.map((v) => v.isbn));
  };

  // auto-search effect (optional)
  // uses debounced raw
  // (kept simple — disabled by default)
  if (autoSearch && valid.length > 0) {
    // we deliberately don't fire on every keystroke; only when the user
    // presses the search button. autoSearch is a hint for the parent to
    // trigger their own debounced effect.
  }

  return (
    <Stack spacing={2}>
      <Box>
        <TextField
          multiline
          minRows={4}
          maxRows={10}
          fullWidth
          placeholder={
            placeholder ??
            t('book.inputPlaceholder')
          }
          value={raw}
          onChange={(e) => update(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1 }}>
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: raw ? (
              <InputAdornment position="end" sx={{ alignSelf: 'flex-start', mt: 1 }}>
                <Tooltip title={t('book.clear')}>
                  <IconButton size="small" onClick={() => update('')} aria-label="clear">
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ) : null,
          }}
        />

        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {parsed.length === 0
              ? t('common.search')
              : `${t('common.search')} · ${valid.length} ${t('book.title')}`}
          </Typography>
          {valid.length > 0 && (
            <Chip label={`✓ ${valid.length}`} size="small" color="success" variant="outlined" />
          )}
          {invalid.length > 0 && (
            <Chip label={`✗ ${invalid.length}`} size="small" color="error" variant="outlined" />
          )}
        </Stack>

        {invalid.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {invalid.map((it, i) => (
              <Chip
                key={`${it.isbn}-${i}`}
                size="small"
                label={`${it.isbn} (${it.reason ?? 'invalid'})`}
                color="warning"
                variant="outlined"
                onDelete={() => {
                  const lines = raw.split(/\r?\n/);
                  const filtered = lines.filter((l) => l.trim() !== it.isbn.trim());
                  update(filtered.join('\n'));
                }}
              />
            ))}
          </Stack>
        )}
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
        <Input
          value={single}
          onChange={(e) => setSingle(e.target.value)}
          onKeyDown={handleSingleKey}
          placeholder="9787..."
          size="small"
          inputProps={{ inputMode: 'numeric', 'aria-label': 'single ISBN' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <ContentPasteIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />
        <Button
          variant="outlined"
          onClick={handleAddSingle}
          disabled={!single.trim()}
          sx={{ minWidth: 84, whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {t('common.add', { defaultValue: '添加' })}
        </Button>
        <Button
          variant="contained"
          onClick={handleSearch}
          disabled={valid.length === 0}
          startIcon={<SearchIcon />}
          sx={{ minWidth: 96, whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {t('book.import')}
        </Button>
      </Stack>
    </Stack>
  );
}
