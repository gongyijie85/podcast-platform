import { Box, Stack, Typography, type SxProps, type Theme } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';
import type { ReactNode } from 'react';

interface Props {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * Friendly empty-state placeholder for lists, tables, and dashboards.
 * Use a custom `icon` or `action` button to guide the user to the next step.
 */
export function Empty({ title = '暂无数据', description, icon, action, sx }: Props): JSX.Element {
  return (
    <Box
      role="status"
      sx={{
        textAlign: 'center',
        py: 6,
        px: 2,
        color: 'text.secondary',
        ...sx,
      }}
    >
      <Stack spacing={1.5} alignItems="center">
        {icon ?? <InboxIcon sx={{ fontSize: 48, color: 'grey.400' }} aria-hidden />}
        <Typography variant="h6" component="div">
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" sx={{ maxWidth: 420 }}>
            {description}
          </Typography>
        )}
        {action && <Box sx={{ pt: 1 }}>{action}</Box>}
      </Stack>
    </Box>
  );
}
