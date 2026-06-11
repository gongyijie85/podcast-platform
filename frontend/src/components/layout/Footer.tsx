import { Box, Container, Typography, Stack, Link as MuiLink } from '@mui/material';
import { useTranslation } from 'react-i18next';

export function Footer(): JSX.Element {
  const { t } = useTranslation();
  return (
    <Box
      component="footer"
      sx={{
        py: 1.5,
        px: 2,
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Container maxWidth={false} disableGutters>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems="center"
          spacing={1}
        >
          <Typography variant="caption" color="text.secondary">
            © {new Date().getFullYear()} {t('app.name')} · v1.0
          </Typography>
          <Stack direction="row" spacing={2}>
            <MuiLink href="/docs" variant="caption" color="text.secondary" underline="hover">
              {t('app.name')} · Docs
            </MuiLink>
            <Typography variant="caption" color="text.secondary">
              MIT License
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
