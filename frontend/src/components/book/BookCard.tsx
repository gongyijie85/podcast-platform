import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Stack,
  Avatar,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Checkbox,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import type { BookMetadata } from '@shared/book';

const SOURCE_LABELS: Record<BookMetadata['source'], string> = {
  openlibrary: '来源：Open Library',
  googlebooks: '来源：Google Books',
  bookrank: '来源：BookRank',
  mock: '来源：Mock 数据',
};

interface Props {
  book: BookMetadata;
  selected?: boolean;
  onUse?: (b: BookMetadata) => void;
  onRemove?: (b: BookMetadata) => void;
  layout?: 'grid' | 'list';
  index?: number;
  selectable?: boolean;
  checked?: boolean;
  onToggleSelect?: (b: BookMetadata) => void;
}

/**
 * Compact book card. Shows cover, title, author, and an "Use this book" button.
 * Used in BookSearch results and Dashboard "recently used" lists.
 */
export function BookCard({
  book,
  selected = false,
  onUse,
  onRemove,
  layout = 'grid',
  index,
  selectable = false,
  checked = false,
  onToggleSelect,
}: Props): JSX.Element {
  const isList = layout === 'list';
  const highlighted = selected || checked;
  const rank = 'rank' in book && typeof book.rank === 'number' ? book.rank : null;
  const categoryName =
    'categoryName' in book && typeof book.categoryName === 'string' ? book.categoryName : null;

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: isList ? { xs: 'column', sm: 'row' } : 'column',
        borderColor: highlighted ? 'primary.main' : 'divider',
        borderWidth: highlighted ? 2 : 1,
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: highlighted ? 'rgba(99, 102, 241, 0.045)' : 'background.paper',
        boxShadow: highlighted
          ? '0 12px 28px rgba(79, 70, 229, 0.10)'
          : '0 1px 2px rgba(15, 23, 42, 0.04)',
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s, background-color 0.15s',
        '&:hover': {
          boxShadow: '0 16px 36px rgba(15, 23, 42, 0.10)',
          borderColor: highlighted ? 'primary.main' : 'primary.light',
          transform: 'translateY(-1px)',
        },
      }}
    >
      <CardContent
        sx={{
          flex: 1,
          pb: isList ? 2 : 1,
          '&:last-child': { pb: isList ? 2 : 2 },
        }}
      >
        <Stack direction="row" spacing={2} alignItems="flex-start">
          {selectable && (
            <Checkbox
              checked={checked}
              onChange={() => onToggleSelect?.(book)}
              inputProps={{ 'aria-label': `选择 ${book.title}` }}
              sx={{
                mt: -1,
                ml: -1,
                flexShrink: 0,
                '& .MuiSvgIcon-root': { fontSize: 22 },
              }}
            />
          )}
          <Box sx={{ position: 'relative', flexShrink: 0 }}>
            <Avatar
              variant="rounded"
              src={book.coverUrl ?? undefined}
              sx={{
                width: isList ? 76 : 64,
                height: isList ? 108 : 88,
                bgcolor: '#eef2ff',
                color: 'primary.main',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
              }}
            >
              <MenuBookIcon />
            </Avatar>
            {typeof index === 'number' && (
              <Box
                aria-label={`result ${index}`}
                sx={{
                  position: 'absolute',
                  top: -8,
                  left: -8,
                  minWidth: 26,
                  height: 26,
                  px: 0.75,
                  borderRadius: 1,
                  bgcolor: '#111827',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  boxShadow: 1,
                }}
              >
                {index}
              </Box>
            )}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant={isList ? 'h6' : 'subtitle1'}
              fontWeight={700}
              sx={{
                lineHeight: 1.25,
                fontSize: isList ? { xs: 16, md: 18 } : undefined,
                letterSpacing: 0,
              }}
              title={book.title}
            >
              {book.title}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              title={book.author}
              sx={{ mt: 0.25, fontWeight: 600 }}
            >
              {book.author}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
              <Chip
                size="small"
                label={book.isbn}
                variant="outlined"
                sx={{ fontFamily: 'monospace' }}
              />
              {rank && (
                <Chip size="small" label={`榜单 #${rank}`} color="primary" variant="filled" />
              )}
              {categoryName && <Chip size="small" label={categoryName} variant="outlined" />}
              {book.publisher && <Chip size="small" label={book.publisher} variant="outlined" />}
              {book.publishedDate && (
                <Chip size="small" label={book.publishedDate} variant="outlined" />
              )}
              <Chip
                size="small"
                label={SOURCE_LABELS[book.source].replace('来源：', '')}
                variant="outlined"
                sx={{ bgcolor: 'background.default' }}
              />
            </Stack>
            {book.summary ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  display: '-webkit-box',
                  WebkitLineClamp: isList ? 5 : 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  mt: 1,
                  lineHeight: 1.75,
                }}
              >
                {book.summary}
              </Typography>
            ) : (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 1, fontStyle: 'italic' }}
              >
                暂无简介信息
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>
      <CardActions
        sx={{
          p: 1.5,
          pt: isList ? { xs: 0, sm: 1.5 } : 0,
          minWidth: isList ? { sm: 168 } : undefined,
          justifyContent: isList ? { xs: 'space-between', sm: 'center' } : 'space-between',
          alignItems: isList ? { xs: 'center', sm: 'flex-end' } : 'center',
          flexDirection: isList ? { xs: 'row', sm: 'column' } : 'row',
          borderLeft: isList ? { sm: '1px solid' } : undefined,
          borderColor: 'divider',
          bgcolor: isList
            ? { sm: highlighted ? 'rgba(99, 102, 241, 0.06)' : '#f8fafc' }
            : undefined,
        }}
      >
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
          {selected && (
            <Chip
              size="small"
              color="success"
              label="已选用"
              icon={<CheckIcon sx={{ fontSize: 14 }} />}
              variant="filled"
            />
          )}
          <Typography variant="caption" color="text.secondary" noWrap>
            {SOURCE_LABELS[book.source]}
          </Typography>
        </Stack>
        <Stack direction={isList ? { xs: 'row', sm: 'column' } : 'row'} spacing={0.75}>
          {onRemove && (
            <Tooltip title="移除">
              <IconButton size="small" onClick={() => onRemove(book)} aria-label="remove book">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onUse && (
            <Button
              size="small"
              variant={selected ? 'outlined' : 'contained'}
              onClick={() => onUse(book)}
              sx={{ whiteSpace: 'nowrap', minWidth: 88 }}
            >
              {selected ? '已选' : '使用此书'}
            </Button>
          )}
        </Stack>
      </CardActions>
    </Card>
  );
}
