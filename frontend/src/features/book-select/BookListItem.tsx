import { Card, CardContent, Typography, Stack, Avatar, Box, IconButton, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import type { BookMetadata } from '@shared/book';

interface Props {
  isbn: string;
  meta?: BookMetadata | { error: string };
  onRetry?: () => void;
  onRemove?: () => void;
}

export function BookListItem({ isbn, meta, onRetry, onRemove }: Props): JSX.Element {
  const isError = meta && 'error' in (meta as { error?: string });
  const isOk = meta && !isError;
  const m = meta as BookMetadata | undefined;
  const err = (meta as { error?: string })?.error;

  return (
    <Card variant="outlined" sx={{ mb: 1.5, opacity: isError ? 0.85 : 1 }}>
      <CardContent sx={{ pb: 1, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar
            variant="rounded"
            src={isOk ? m?.coverUrl ?? undefined : undefined}
            sx={{ width: 56, height: 56, bgcolor: isError ? 'grey.300' : 'primary.light' }}
          >
            {isError ? '⚠️' : '📘'}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary" noWrap>
              {isbn}
            </Typography>
            {isOk && m && (
              <>
                <Typography variant="subtitle1" fontWeight={600} noWrap>
                  {m.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  作者：{m.author}
                </Typography>
              </>
            )}
            {isError && (
              <Typography variant="body2" color="error">
                抓取失败{err ? ` - ${err}` : ''}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={0.5}>
            {isError && onRetry && (
              <Tooltip title="重试">
                <IconButton size="small" onClick={onRetry}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {onRemove && (
              <Tooltip title="移除">
                <IconButton size="small" onClick={onRemove}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
