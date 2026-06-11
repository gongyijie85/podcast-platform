import { Card, CardContent, CardActions, Typography, Button, Stack, Avatar, Box, Chip, IconButton, Tooltip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import type { BookMetadata } from '@shared/book';

interface Props {
  book: BookMetadata;
  selected?: boolean;
  onUse?: (b: BookMetadata) => void;
  onRemove?: (b: BookMetadata) => void;
}

/**
 * Compact book card. Shows cover, title, author, and an "Use this book" button.
 * Used in BookSearch results and Dashboard "recently used" lists.
 */
export function BookCard({ book, selected = false, onUse, onRemove }: Props): JSX.Element {
  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderColor: selected ? 'primary.main' : 'divider',
        borderWidth: selected ? 2 : 1,
        transition: 'all 0.15s',
        '&:hover': { boxShadow: 2 },
      }}
    >
      <CardContent sx={{ flex: 1, pb: 1, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Avatar
            variant="rounded"
            src={book.coverUrl ?? undefined}
            sx={{ width: 64, height: 88, bgcolor: 'primary.light', flexShrink: 0 }}
          >
            <MenuBookIcon />
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ lineHeight: 1.3 }} title={book.title}>
              {book.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" title={book.author}>
              {book.author}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
              <Chip size="small" label={book.isbn} variant="outlined" />
              {book.publisher && <Chip size="small" label={book.publisher} variant="outlined" />}
              {book.publishedDate && <Chip size="small" label={book.publishedDate} variant="outlined" />}
            </Stack>
            {book.summary && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  mt: 1,
                }}
              >
                {book.summary}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>
      <CardActions sx={{ p: 1.5, pt: 0, justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {selected && (
            <Chip
              size="small"
              color="success"
              label="已选用"
              icon={<CheckIcon sx={{ fontSize: 14 }} />}
              variant="filled"
            />
          )}
          <Typography variant="caption" color="text.secondary">
            {book.source}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5}>
          {onRemove && (
            <Tooltip title="移除">
              <IconButton size="small" onClick={() => onRemove(book)} aria-label="remove book">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onUse && (
            <Button size="small" variant={selected ? 'outlined' : 'contained'} onClick={() => onUse(book)}>
              {selected ? '已选' : '使用此书'}
            </Button>
          )}
        </Stack>
      </CardActions>
    </Card>
  );
}
