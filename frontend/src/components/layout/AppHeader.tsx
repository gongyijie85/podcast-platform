import { AppBar, Toolbar, Typography, Button, Box, IconButton, Stack } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import { useUserStore } from '../../store/user.store';
import { useMobile } from '../../hooks/useMediaQuery';
import MenuIcon from '@mui/icons-material/Menu';
import { useUiStore } from '../../store/ui.store';

const STEPS = [
  { key: 'book', label: '① 选书', path: '/book' },
  { key: 'config', label: '② 配置', path: '/config' },
  { key: 'generating', label: '③ 生成', path: '/generating' },
  { key: 'preview', label: '④ 导出', path: '/preview' },
];

export function AppHeader(): JSX.Element {
  const navigate = useNavigate();
  const isMobile = useMobile();
  const user = useUserStore((s) => s.user);
  const loggedIn = useUserStore((s) => s.loggedIn);
  const logout = useUserStore((s) => s.logout);
  const setDrawer = useUiStore((s) => s.setDrawer);

  return (
    <AppBar position="sticky" elevation={0} color="default" sx={{ bgcolor: 'white', borderBottom: '1px solid #e5e7eb' }}>
      <Toolbar sx={{ gap: 2 }}>
        <IconButton
          edge="start"
          sx={{ display: { xs: 'inline-flex', md: 'none' } }}
          onClick={() => setDrawer(true)}
          aria-label="open menu"
        >
          <MenuIcon />
        </IconButton>
        <Typography
          variant="h6"
          component={Link}
          to="/"
          sx={{ color: 'primary.main', textDecoration: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}
        >
          🎙 Podcast Platform
        </Typography>

        {!isMobile && (
          <Stack direction="row" spacing={1} sx={{ ml: 2 }}>
            {STEPS.map((s) => (
              <Button key={s.key} size="small" onClick={() => navigate(s.path)} sx={{ color: 'text.primary' }}>
                {s.label}
              </Button>
            ))}
          </Stack>
        )}

        <Box sx={{ flex: 1 }} />

        {loggedIn ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {user?.nickname}
            </Typography>
            <Button size="small" onClick={() => void logout().then(() => navigate('/'))}>
              退出
            </Button>
          </Stack>
        ) : (
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" onClick={() => navigate('/login')}>登录</Button>
            <Button size="small" variant="contained" onClick={() => navigate('/register')}>注册</Button>
          </Stack>
        )}
      </Toolbar>
    </AppBar>
  );
}
