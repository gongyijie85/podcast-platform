import { Outlet } from 'react-router-dom';
import { Box } from '@mui/material';
import { Sidebar } from '../components/layout/Sidebar';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { useUiStore } from '../store/ui.store';
import { useMobile, useTablet } from '../hooks/useMediaQuery';

/**
 * Primary app shell: persistent left sidebar (collapsible), top bar, scrollable
 * main content, and a slim footer. On mobile the sidebar becomes a temporary
 * drawer toggled by the menu icon in the header.
 */
export function MainLayout(): JSX.Element {
  const isMobile = useMobile();
  const isTablet = useTablet();
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const setDrawer = useUiStore((s) => s.setDrawer);
  const uiSidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  // 平板自动折叠侧边栏，留出更多主内容空间；桌面端尊重用户手动设置。
  const sidebarCollapsed = !isMobile && (isTablet || uiSidebarCollapsed);

  return (
    <Box className="app-shell" sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Sidebar: persistent on desktop/tablet, drawer on mobile */}
      <Sidebar
        variant={isMobile ? 'temporary' : 'persistent'}
        open={isMobile ? drawerOpen : true}
        onClose={() => setDrawer(false)}
        collapsed={sidebarCollapsed}
      />

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          ml: { xs: 0, md: sidebarCollapsed ? '72px' : '240px' },
          transition: 'margin-left 0.2s ease',
        }}
      >
        <Header />
        <Box component="main" sx={{ flex: 1, p: { xs: 2, md: 3 }, minWidth: 0 }} role="main">
          <Outlet />
        </Box>
        <Footer />
      </Box>
    </Box>
  );
}
