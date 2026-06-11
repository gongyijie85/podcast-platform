import { useEffect, useState, useCallback, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Stack,
  Typography,
  Button,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useApi } from '../hooks/useApi';
import { projectApi } from '../api/project.api';
import { useAuthStore } from '../store/auth.store';
import { useUiStore } from '../store/ui.store';
import { Empty } from '../components/common/Empty';
import { Loading } from '../components/common/Loading';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { formatTime, formatPercent } from '../utils/format';
import type { ProjectDto } from '@shared/project';

const STATUS_COLOR: Record<ProjectDto['status'], 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info'> = {
  draft: 'default',
  generating: 'primary',
  done: 'success',
  failed: 'error',
  cancelled: 'warning',
  partial: 'info',
};

const STATUS_LABEL: Record<ProjectDto['status'], string> = {
  draft: '草稿',
  generating: '生成中',
  done: '已完成',
  failed: '失败',
  cancelled: '已取消',
  partial: '部分完成',
};

export function Dashboard(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const push = useUiStore((s) => s.push);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectDto | null>(null);

  // Backend doesn't expose DELETE /projects yet; the API would 404. Use get/list.
  const { data, loading, error, refetch } = useApi(() => projectApi.list(1, 50), []);

  useEffect(() => {
    if (error) push(`加载项目失败: ${error.message}`, 'error');
  }, [error, push]);

  const onOpenMenu = (e: MouseEvent<HTMLElement>, p: ProjectDto): void => {
    e.stopPropagation();
    setActiveProject(p);
    setMenuAnchor(e.currentTarget);
  };
  const closeMenu = (): void => setMenuAnchor(null);

  const onConfirmDelete = useCallback(async (): Promise<void> => {
    if (!confirmDelete) return;
    push(`「${confirmDelete.title}」暂未接入删除接口，请到后端服务中清理。`, 'info');
    setConfirmDelete(null);
    void refetch();
  }, [confirmDelete, push, refetch]);

  const projects = data?.items ?? [];

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            {t('dashboard.title')}
          </Typography>
          <Typography color="text.secondary">
            {t('dashboard.welcome', { name: user?.nickname || user?.email || '访客' })}
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          startIcon={<AddCircleIcon />}
          onClick={() => navigate('/projects/new')}
        >
          {t('dashboard.newProject')}
        </Button>
      </Stack>

      {loading ? (
        <Loading label={t('common.loading')} fullScreen />
      ) : projects.length === 0 ? (
        <Empty
          title={t('dashboard.noProjects')}
          description={`${t('app.tagline')} · ${t('common.startGenerate')}`}
          action={
            <Button variant="contained" startIcon={<AddCircleIcon />} onClick={() => navigate('/projects/new')}>
              {t('dashboard.newProject')}
            </Button>
          }
        />
      ) : (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>
              {t('dashboard.recentProjects')}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Tooltip title="刷新">
                <IconButton onClick={() => void refetch()} aria-label="refresh">
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Button size="small" onClick={() => navigate('/projects')}>
                {t('dashboard.viewAll')}
              </Button>
            </Stack>
          </Stack>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                lg: 'repeat(3, 1fr)',
              },
            }}
          >
            {projects.slice(0, 6).map((p) => (
              <Card key={p.id} variant="outlined" sx={{ height: '100%' }}>
                <CardActionArea
                  onClick={() => navigate(`/projects/${p.id}`)}
                  sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                >
                  <CardContent sx={{ flex: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Typography variant="subtitle1" fontWeight={600} sx={{ pr: 1, lineHeight: 1.3 }} noWrap>
                        {p.title}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={(e) => onOpenMenu(e, p)}
                        aria-label="project actions"
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                      <Chip
                        size="small"
                        color={STATUS_COLOR[p.status]}
                        label={STATUS_LABEL[p.status]}
                        variant={p.status === 'generating' ? 'filled' : 'outlined'}
                      />
                      <Chip size="small" label={p.mode === 'merged' ? '合并' : '独立'} variant="outlined" />
                      {p.currentStage && p.status === 'generating' && (
                        <Chip size="small" label={p.currentStage} variant="outlined" />
                      )}
                    </Stack>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        {formatTime(p.updatedAt)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatPercent(p.progress)}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={p.progress}
                      sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
                    />
                    {p.books && p.books.length > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        📚 {p.books.length} 本书
                      </Typography>
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </>
      )}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        {activeProject && (
          <>
            <MenuItem
              onClick={() => {
                closeMenu();
                navigate(`/projects/${activeProject.id}`);
              }}
            >
              <ListItemIcon>
                <OpenInNewIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{t('projects.openDetail')}</ListItemText>
            </MenuItem>
            {activeProject.status === 'generating' && (
              <MenuItem
                onClick={() => {
                  closeMenu();
                  navigate(`/projects/${activeProject.id}`);
                }}
              >
                <ListItemIcon>
                  <PlayArrowIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>查看进度</ListItemText>
              </MenuItem>
            )}
            <Divider />
            <MenuItem
              onClick={() => {
                closeMenu();
                setConfirmDelete(activeProject);
              }}
            >
              <ListItemIcon>
                <DeleteOutlineIcon fontSize="small" color="error" />
              </ListItemIcon>
              <ListItemText sx={{ color: 'error.main' }}>{t('projects.delete')}</ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={t('projects.delete')}
        message={t('projects.deleteConfirm')}
        confirmText={t('projects.delete')}
        confirmColor="error"
        onConfirm={onConfirmDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </Box>
  );
}
