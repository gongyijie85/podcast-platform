import { TextField, Box, Button, Stack, Typography } from '@mui/material';
import { useEffect, useMemo } from 'react';
import { useBooksStore } from '../../store/books.store';
import { parseIsbnInput } from '../../utils/isbn';

export function IsbnInput(): JSX.Element {
  const raw = useBooksStore((s) => s.raw);
  const setRaw = useBooksStore((s) => s.setRaw);
  const setParsed = useBooksStore((s) => s.setParsed);
  const reset = useBooksStore((s) => s.reset);
  const parsed = useMemo(() => parseIsbnInput(raw), [raw]);

  useEffect(() => {
    setParsed(parsed);
  }, [parsed, setParsed]);

  const validCount = parsed.filter((p) => p.valid).length;
  const invalidCount = parsed.length - validCount;

  return (
    <Box>
      <TextField
        multiline
        minRows={5}
        maxRows={10}
        fullWidth
        placeholder="粘贴 ISBN 列表（每行一个，或用逗号/空格分隔）&#10;例：9787121362200&#10;9787508672069"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        sx={{ bgcolor: 'white' }}
      />
      <Stack direction="row" spacing={2} sx={{ mt: 1, alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          共 {parsed.length} 条 · 合法 {validCount} · 非法 {invalidCount}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button onClick={reset} disabled={!raw}>清空</Button>
      </Stack>
    </Box>
  );
}
