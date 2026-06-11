import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, Stack, Typography } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';

export function NotFound(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3,
        textAlign: 'center',
      }}
    >
      <Stack spacing={2} alignItems="center" sx={{ maxWidth: 480 }}>
        <Typography variant="h1" sx={{ fontSize: { xs: 96, md: 144 }, fontWeight: 800, color: 'primary.main', lineHeight: 1 }}>
          404
        </Typography>
        <Typography variant="h5" fontWeight={600}>
          {t('notFound.title')}
        </Typography>
        <Typography color="text.secondary">{t('notFound.description')}</Typography>
        <Button
          variant="contained"
          size="large"
          startIcon={<HomeIcon />}
          onClick={() => navigate('/dashboard')}
          sx={{ mt: 2 }}
        >
          {t('notFound.back')}
        </Button>
      </Stack>
    </Box>
  );
}
