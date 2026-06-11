import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AppBar,
  Toolbar,
  Box,
  IconButton,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
  Tooltip,
  Stack,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import { useState, type MouseEvent } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { useUiStore } from '../../store/ui.store';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';

export function Header(): JSX.Element {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const setDrawer = useUiStore((s) => s.setDrawer);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const open = (e: MouseEvent<HTMLElement>): void => setAnchor(e.currentTarget);
  const close = (): void => setAnchor(null);

  const onLogout = async (): Promise<void> => {
    close();
    await logout();
    navigate('/login');
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="default"
      sx={{
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        zIndex: (theme) => theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar sx={{ gap: 1 }}>
        <IconButton
          edge="start"
          onClick={() => setDrawer(true)}
          aria-label="open navigation"
          sx={{ display: { md: 'none' } }}
        >
          <MenuIcon />
        </IconButton>

        <Box sx={{ flex: 1 }} />

        <Stack direction="row" spacing={0.5} alignItems="center">
          <LanguageSwitcher />
          <ThemeToggle />

          {isAuthed && user ? (
            <>
              <Tooltip title={user.nickname || user.email}>
                <IconButton onClick={open} aria-label="user menu" size="small" sx={{ ml: 1 }}>
                  <Avatar
                    src={user.avatarUrl ?? undefined}
                    sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}
                  >
                    {(user.nickname || user.email || '?').slice(0, 1).toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} keepMounted>
                <Box sx={{ px: 2, py: 1.5, minWidth: 200 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {user.nickname}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {user.email}
                  </Typography>
                </Box>
                <Divider />
                <MenuItem
                  onClick={() => {
                    close();
                    navigate('/settings');
                  }}
                >
                  <ListItemIcon>
                    <PersonIcon fontSize="small" />
                  </ListItemIcon>
                  {t('nav.settings')}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    close();
                    navigate('/settings');
                  }}
                >
                  <ListItemIcon>
                    <SettingsIcon fontSize="small" />
                  </ListItemIcon>
                  {t('nav.settings')}
                </MenuItem>
                <Divider />
                <MenuItem onClick={onLogout}>
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  {t('nav.logout')}
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ ml: 1, cursor: 'pointer' }}
              onClick={() => navigate('/login')}
            >
              {t('nav.login')}
            </Typography>
          )}
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
