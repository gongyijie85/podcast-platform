import { Box, Stack, Typography, type SxProps, type Theme } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { useMobile } from '../../hooks/useMediaQuery';

interface Step {
  key: string;
  label: string;
}

interface Props {
  steps: Step[];
  current: number; // 1-indexed; values outside the range are clamped
  sx?: SxProps<Theme>;
}

/**
 * Numbered stepper used by the project creation wizard.
 * Renders a horizontal row on desktop, a vertical list on mobile.
 */
export function StepIndicator({ steps, current, sx }: Props): JSX.Element {
  const isMobile = useMobile();
  const safeCurrent = Math.max(1, Math.min(steps.length, Math.floor(current)));

  if (isMobile) {
    return (
      <Stack spacing={1} sx={sx}>
        {steps.map((s, i) => {
          const idx = i + 1;
          const done = idx < safeCurrent;
          const active = idx === safeCurrent;
          return (
            <Stack
              key={s.key}
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{
                color: done ? 'success.main' : active ? 'primary.main' : 'text.disabled',
              }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  bgcolor: done ? 'success.main' : active ? 'primary.main' : 'grey.300',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {done ? <CheckIcon fontSize="inherit" /> : idx}
              </Box>
              <Typography variant="body2" fontWeight={active ? 600 : 500}>
                {s.label}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    );
  }

  return (
    <Stack
      direction="row"
      spacing={0}
      alignItems="center"
      sx={{ width: '100%', ...sx }}
      role="progressbar"
      aria-valuenow={safeCurrent}
      aria-valuemin={1}
      aria-valuemax={steps.length}
    >
      {steps.map((s, i) => {
        const idx = i + 1;
        const done = idx < safeCurrent;
        const active = idx === safeCurrent;
        const isLast = i === steps.length - 1;
        return (
          <Box
            key={s.key}
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'relative',
            }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                bgcolor: done ? 'success.main' : active ? 'primary.main' : 'grey.300',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 700,
                zIndex: 1,
                position: 'relative',
                boxShadow: active ? '0 0 0 4px rgba(99,102,241,0.15)' : 'none',
              }}
            >
              {done ? <CheckIcon fontSize="small" /> : idx}
            </Box>
            <Typography
              variant="caption"
              sx={{
                mt: 0.75,
                color: done ? 'success.main' : active ? 'primary.main' : 'text.secondary',
                fontWeight: active ? 600 : 500,
                textAlign: 'center',
                fontSize: { xs: 11, md: 12 },
              }}
            >
              {s.label}
            </Typography>
            {!isLast && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 16,
                  left: '50%',
                  right: '-50%',
                  height: 2,
                  bgcolor: idx < safeCurrent ? 'success.main' : 'grey.300',
                  zIndex: 0,
                }}
              />
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
