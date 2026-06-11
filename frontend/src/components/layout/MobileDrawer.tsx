import { Drawer, List, ListItemButton, ListItemText, Divider, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../../store/ui.store';

const ITEMS = [
  { label: '首页', path: '/' },
  { label: '① 选书', path: '/book' },
  { label: '② 配置', path: '/config' },
  { label: '③ 生成', path: '/generating' },
  { label: '④ 预览&导出', path: '/preview' },
  { label: '登录', path: '/login' },
  { label: '注册', path: '/register' },
];

export function MobileDrawer(): JSX.Element {
  const open = useUiStore((s) => s.drawerOpen);
  const setOpen = useUiStore((s) => s.setDrawer);
  const navigate = useNavigate();
  return (
    <Drawer open={open} onClose={() => setOpen(false)}>
      <Box sx={{ width: 260, pt: 2 }}>
        <List>
          {ITEMS.map((it) => (
            <ListItemButton
              key={it.path}
              onClick={() => {
                navigate(it.path);
                setOpen(false);
              }}
            >
              <ListItemText primary={it.label} />
            </ListItemButton>
          ))}
        </List>
        <Divider />
      </Box>
    </Drawer>
  );
}
