import { Box, Typography, Stack, type SxProps, type Theme } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';

interface Props {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  sx?: SxProps<Theme>;
}

export function EmptyState({ title = '暂无数据', description, action, icon, sx }: Props): JSX.Element {
  return (
    <Box
      sx={{
        textAlign: 'center',
        py: 6,
        color: 'text.secondary',
        ...sx,
      }}
    >
      <Stack spacing={2} alignItems="center">
        {icon ?? <InboxIcon sx={{ fontSize: 48, color: 'grey.400' }} />}
        <Typography variant="h6">{title}</Typography>
        {description && <Typography variant="body2">{description}</Typography>}
        {action}
      </Stack>
    </Box>
  );
}
