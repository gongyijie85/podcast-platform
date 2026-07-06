import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  InputAdornment,
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
  Pagination,
} from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import SearchIcon from '@mui/icons-material/Search';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import { projectApi } from '../api/project.api';
import { useApi } from '../hooks/useApi';
import { useUiStore } from '../store/ui.store';
import { useAuthStore } from '../store/auth.store';
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

const PAGE_SIZE = 12;

export function Projects(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const push = useUiStore((s) => s.push);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState<ProjectDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectDto | null>(null);
  const { data, loading, refetch } = useApi(
    () => (
      isAuthenticated
        ? projectApi.list(page, PAGE_SIZE)
        : Promise.resolve({ items: [], total: 0, page, pageSize: PAGE_SIZE })
    ),
    [isAuthenticated, page],
  );

  useEffect(() => {
    // when page changes, refetch
  }, [page]);

  const filtered = useMemo(() => {
    const all = data?.items ?? [];
    if (!keyword.trim()) return all;
    const k = keyword.toLowerCase();
    return all.filter(
      (p) => p.title.toLowerCase().includes(k) || p.id.toLowerCase().includes(k),
    );
  }, [data, keyword]);

  const onOpenMenu = (e: MouseEvent<HTMLElement>, p: ProjectDto): void => {
    e.stopPropagation();
    setActive(p);
    setMenuAnchor(e.currentTarget);
  };

  const onConfirmDelete = async (): Promise<void> => {
    if (!confirmDelete) return;
    push(`「${confirmDelete.title}」暂未接入删除接口`, 'info');
    setConfirmDelete(null);
    void refetch();
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
            {t('projects.title')}
          </Typography>
          <Typography color="text.secondary">共 {total} 个项目</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddCircleIcon />}
          onClick={() => navigate('/projects/new')}
        >
          {t('dashboard.newProject')}
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
        <TextField
          size="small"
          placeholder={t('projects.search')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          sx={{ flex: 1, maxWidth: 480 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
          inputProps={{ 'aria-label': t('common.search') }}
        />
        <Tooltip title="刷新">
          <IconButton onClick={() => void refetch()} aria-label="refresh">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {loading ? (
        <Loading fullScreen label={t('common.loading')} />
      ) : filtered.length === 0 ? (
        <Empty
          title={t('projects.empty')}
          description="尝试调整搜索词，或点击「新建项目」开始第一次创作"
          action={
            <Button variant="contained" onClick={() => navigate('/projects/new')}>
              {t('dashboard.newProject')}
            </Button>
          }
        />
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                lg: 'repeat(3, 1fr)',
                xl: 'repeat(4, 1fr)',
              },
            }}
          >
            {filtered.map((p) => (
              <Card key={p.id} variant="outlined" sx={{ height: '100%' }}>
                <CardActionArea
                  onClick={() => navigate(`/projects/${p.id}`)}
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', height: '100%' }}
                >
                  <CardContent sx={{ flex: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Typography variant="subtitle1" fontWeight={600} noWrap sx={{ pr: 1 }}>
                        {p.title}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={(e) => onOpenMenu(e, p)}
                        aria-label="actions"
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
                    <LinearProgress variant="determinate" value={p.progress} sx={{ mt: 0.5, height: 6, borderRadius: 3 }} />
                    {p.books && p.books.length > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        📚 {p.books.length} 本
                      </Typography>
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Box>

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, v) => setPage(v)}
                color="primary"
              />
            </Box>
          )}
        </>
      )}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {active && (
          <>
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                navigate(`/projects/${active.id}`);
              }}
            >
              <ListItemIcon>
                <OpenInNewIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{t('projects.openDetail')}</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                setConfirmDelete(active);
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
