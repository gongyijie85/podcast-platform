import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { shareApi } from '../api/share.api';
import { coverApi } from '../api/cover.api';
import { Loading } from '../components/common/Loading';
import { Empty } from '../components/common/Empty';
import { SubtitleOverlay } from '../components/player/SubtitleOverlay';
import type { SharedProjectDto } from '@shared/project';

export function SharePreview(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedProjectDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    shareApi
      .get(token)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '分享链接不可用或已过期');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) return <Loading fullScreen label="正在加载分享内容..." />;
  if (error || !data) {
    return (
      <Empty
        title="分享链接不可用"
        description={error ?? '链接可能已经过期，请让项目所有者重新生成分享链接。'}
      />
    );
  }

  const project = data.project;
  const coverUrl = project.coverUrl || coverApi.buildFallbackCover(project.title);

  return (
    <Box sx={{ maxWidth: 920, mx: 'auto', p: { xs: 2, md: 4 } }}>
      <Stack spacing={3}>
        <Alert severity="info">这是只读试听分享页，链接 7 天有效，不能编辑项目内容。</Alert>
        <Card variant="outlined">
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
              <Box
                component="img"
                src={coverUrl}
                alt={`${project.title} cover`}
                sx={{ width: { xs: '100%', md: 220 }, aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 2 }}
              />
              <Stack spacing={1.5} sx={{ flex: 1 }}>
                <Typography variant="h4" fontWeight={800}>
                  {project.title}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip label={project.status} color={project.status === 'done' ? 'success' : 'default'} />
                  <Chip icon={<AccessTimeIcon />} label={`有效期至 ${new Date(data.share.expiresAt).toLocaleString()}`} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {(project.books ?? []).map((book) => `${book.title} · ${book.author}`).join(' / ') || '暂无图书元数据'}
                </Typography>
                {project.audioUrl ? (
                  <Box component="audio" src={project.audioUrl} controls sx={{ width: '100%', mt: 2 }} />
                ) : (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    当前项目还没有可试听音频，分享页会保留但只能查看元数据。
                  </Alert>
                )}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
              字幕预览
            </Typography>
            <SubtitleOverlay segments={[]} currentMs={0} style={{ fontSize: 15, lineHeight: 1.7 }} />
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
