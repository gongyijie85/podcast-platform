import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  IconButton,
  Tooltip,
  Typography,
  Stack,
  type SxProps,
  type Theme,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import SearchIcon from '@mui/icons-material/Search';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { useUiStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';

interface NavItem {
  key: string;
  labelKey: string;
  path: string;
  icon: JSX.Element;
  requireAuth?: boolean;
}

const ITEMS: NavItem[] = [
  { key: 'dashboard', labelKey: 'nav.dashboard', path: '/dashboard', icon: <DashboardIcon />, requireAuth: true },
  { key: 'projects', labelKey: 'nav.projects', path: '/projects', icon: <LibraryBooksIcon />, requireAuth: true },
  { key: 'new', labelKey: 'dashboard.newProject', path: '/projects/new', icon: <AddCircleOutlineIcon />, requireAuth: true },
  { key: 'book', labelKey: 'nav.book', path: '/books', icon: <SearchIcon /> },
  { key: 'settings', labelKey: 'nav.settings', path: '/settings', icon: <SettingsIcon />, requireAuth: true },
];

const DRAWER_WIDTH = 240;
const COLLAPSED_WIDTH = 72;

interface Props {
  variant: 'permanent' | 'persistent' | 'temporary';
  open: boolean;
  onClose: () => void;
  collapsed?: boolean;
}

export function Sidebar({ variant, open, onClose, collapsed = false }: Props): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const isAuthed = useAuthStore((s) => s.isAuthenticated);

  const width = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

  const isActive = useCallback(
    (path: string): boolean => {
      if (path === '/dashboard') return location.pathname === '/dashboard' || location.pathname === '/';
      return location.pathname.startsWith(path);
    },
    [location.pathname],
  );

  const handleNav = (item: NavItem): void => {
    onClose();
    if (item.requireAuth && !isAuthed) {
      navigate('/login', { state: { from: item.path } });
      return;
    }
    navigate(item.path);
  };

  const listSx: SxProps<Theme> = {
    width,
    boxSizing: 'border-box',
    bgcolor: 'background.paper',
    borderRight: '1px solid',
    borderColor: 'divider',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  };

  const content = (
    <>
      <Toolbar
        sx={{
          px: collapsed ? 0 : 2,
          minHeight: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 1,
        }}
      >
        {!collapsed && (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
            <Box
              aria-hidden
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1.5,
                bgcolor: 'primary.main',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}
            >
              🎙
            </Box>
            <Typography variant="subtitle1" fontWeight={700} noWrap>
              {t('app.name')}
            </Typography>
          </Stack>
        )}
        {variant !== 'temporary' && (
          <Tooltip title={collapsed ? t('common.next') : t('common.prev')} placement="right">
            <IconButton
              size="small"
              onClick={toggleSidebar}
              aria-label={collapsed ? 'expand sidebar' : 'collapse sidebar'}
            >
              {collapsed ? <MenuIcon /> : <ChevronLeftIcon />}
            </IconButton>
          </Tooltip>
        )}
      </Toolbar>
      <Divider />
      <List sx={{ flex: 1, py: 1 }}>
        {ITEMS.map((item) => {
          const active = isActive(item.path);
          const btn = (
            <ListItemButton
              key={item.key}
              selected={active}
              onClick={() => handleNav(item)}
              sx={{
                mx: 1,
                borderRadius: 1.5,
                minHeight: 44,
                justifyContent: collapsed ? 'center' : 'flex-start',
                px: collapsed ? 1 : 2,
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                  '&:hover': { bgcolor: 'primary.dark' },
                },
              }}
              aria-label={t(item.labelKey)}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  mr: collapsed ? 0 : 2,
                  justifyContent: 'center',
                  color: active ? 'inherit' : 'text.secondary',
                }}
              >
                {item.icon}
              </ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary={t(item.labelKey)}
                  primaryTypographyProps={{ fontSize: 14, fontWeight: active ? 600 : 500 }}
                />
              )}
            </ListItemButton>
          );

          return collapsed ? (
            <Tooltip key={item.key} title={t(item.labelKey)} placement="right">
              {btn}
            </Tooltip>
          ) : (
            btn
          );
        })}
      </List>
    </>
  );

  if (variant === 'temporary') {
    return (
      <Drawer
        variant="temporary"
        open={open}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{ '& .MuiDrawer-paper': { width, boxSizing: 'border-box' } }}
      >
        {content}
      </Drawer>
    );
  }

  return (
    <Drawer
      variant={variant}
      open={open}
      onClose={onClose}
      sx={{
        width,
        flexShrink: 0,
        '& .MuiDrawer-paper': { ...listSx, position: 'fixed', top: 0, left: 0, height: '100vh' },
      }}
    >
      {content}
    </Drawer>
  );
}
