import { Outlet, Link as RouterLink } from 'react-router-dom';
import { Box, Container, Paper, Stack, Typography, Link as MuiLink } from '@mui/material';
import { useTranslation } from 'react-i18next';

/**
 * Layout for /login and /register. Centered card on a soft gradient background.
 * No navigation chrome so users are not distracted from authenticating.
 */
export function AuthLayout(): JSX.Element {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #eef2ff 0%, #fdf2f8 100%)',
      }}
    >
      <Box component="header" sx={{ py: 3, px: { xs: 2, md: 4 } }}>
        <Container maxWidth="lg">
          <MuiLink component={RouterLink} to="/" underline="none" color="inherit">
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: 'primary.main',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                }}
                aria-hidden
              >
                🎙
              </Box>
              <Typography variant="h6" fontWeight={700} color="text.primary">
                {t('app.name')}
              </Typography>
            </Stack>
          </MuiLink>
        </Container>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
        <Paper
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: 480,
            p: { xs: 3, md: 5 },
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Outlet />
        </Paper>
      </Box>

      <Box component="footer" sx={{ py: 2, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          © {new Date().getFullYear()} {t('app.name')} · v1.0
        </Typography>
      </Box>
    </Box>
  );
}
