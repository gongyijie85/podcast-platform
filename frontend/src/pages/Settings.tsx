import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  Switch,
  FormControlLabel,
  Divider,
  Button,
  RadioGroup,
  Radio,
  List,
  ListItem,
  ListItemText,
  type SelectChangeEvent,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuthStore } from '../store/auth.store';
import { useUiStore, type Language, type ThemeMode } from '../store/ui.store';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import i18n from '../i18n';
import { disconnectSocket } from '../ws/socket';

export function Settings(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const language = useUiStore((s) => s.language);
  const setLanguage = useUiStore((s) => s.setLanguage);
  const elderMode = useUiStore((s) => s.elderMode);
  const setElderMode = useUiStore((s) => s.setElderMode);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthed) navigate('/login', { replace: true });
  }, [isAuthed, navigate]);

  const onLogout = async (): Promise<void> => {
    setConfirmOpen(false);
    await logout();
    disconnectSocket();
    navigate('/login', { replace: true });
  };

  const handleLanguage = async (_: SelectChangeEvent<Language> | React.ChangeEvent<HTMLInputElement>, v: string): Promise<void> => {
    if (!v) return;
    const code = v as Language;
    setLanguage(code);
    await i18n.changeLanguage(code);
  };

  const handleTheme = async (_: React.ChangeEvent<HTMLInputElement>, v: string): Promise<void> => {
    if (!v) return;
    setTheme(v as ThemeMode);
  };

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            {t('settings.title')}
          </Typography>
          <Typography color="text.secondary">{t('app.tagline')}</Typography>
        </Box>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
              账户
            </Typography>
            <List disablePadding>
              <ListItem disableGutters>
                <ListItemText primary={t('auth.nickname')} secondary={user?.nickname || '—'} />
              </ListItem>
              <ListItem disableGutters>
                <ListItemText primary={t('auth.email')} secondary={user?.email || '—'} />
              </ListItem>
            </List>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
              {t('settings.theme')}
            </Typography>
            <RadioGroup row value={theme} onChange={handleTheme}>
              <FormControlLabel value="light" control={<Radio />} label={t('settings.themeLight')} />
              <FormControlLabel value="dark" control={<Radio />} label={t('settings.themeDark')} />
            </RadioGroup>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
              {t('settings.language')}
            </Typography>
            <RadioGroup row value={language} onChange={(e) => void handleLanguage(e, e.target.value)}>
              <FormControlLabel value="zh-CN" control={<Radio />} label={t('settings.languageZh')} />
              <FormControlLabel value="en-US" control={<Radio />} label={t('settings.languageEn')} />
            </RadioGroup>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
              偏好
            </Typography>
            <Stack spacing={1}>
              <FormControlLabel
                control={
                  <Switch
                    checked={elderMode}
                    onChange={(e) => setElderMode(e.target.checked)}
                  />
                }
                label={t('settings.elderMode')}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={theme === 'dark'}
                    onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
                  />
                }
                label={t('settings.darkMode')}
              />
              <FormControlLabel
                control={<Switch defaultChecked />}
                label={t('settings.notifyOnComplete')}
              />
              <FormControlLabel
                control={<Switch defaultChecked />}
                label={t('settings.autoPlayBgm')}
              />
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
              危险操作
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              退出登录后会清空本机的会话信息，但不会删除您创建的项目。
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Button
              variant="outlined"
              color="error"
              startIcon={<LogoutIcon />}
              onClick={() => setConfirmOpen(true)}
            >
              {t('settings.logout')}
            </Button>
          </CardContent>
        </Card>

        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Podcast Platform · v1.0.0 · MIT
          </Typography>
        </Box>
      </Stack>

      <ConfirmDialog
        open={confirmOpen}
        title={t('settings.logout')}
        message={t('settings.logoutConfirm')}
        confirmText={t('settings.logout')}
        cancelText={t('common.cancel')}
        confirmColor="error"
        onConfirm={onLogout}
        onClose={() => setConfirmOpen(false)}
      />
    </Box>
  );
}
