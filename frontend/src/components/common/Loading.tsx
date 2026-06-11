import { Box, CircularProgress, Typography, Stack, type SxProps, type Theme } from '@mui/material';

interface Props {
  fullScreen?: boolean;
  label?: string;
  size?: number;
  sx?: SxProps<Theme>;
}

/**
 * Reusable loading indicator. Defaults to an inline spinner; switch to
 * `fullScreen` for a centered overlay suitable for initial page loads.
 */
export function Loading({ fullScreen = false, label, size = 32, sx }: Props): JSX.Element {
  if (fullScreen) {
    return (
      <Box
        role="status"
        aria-label={label ?? 'loading'}
        sx={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...sx,
        }}
      >
        <Stack alignItems="center" spacing={1.5}>
          <CircularProgress size={Math.max(28, size)} />
          {label && (
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
          )}
        </Stack>
      </Box>
    );
  }
  return (
    <Box role="status" aria-label={label ?? 'loading'} sx={{ display: 'inline-flex', alignItems: 'center', ...sx }}>
      <CircularProgress size={size} />
      {label && (
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1.5 }}>
          {label}
        </Typography>
      )}
    </Box>
  );
}
