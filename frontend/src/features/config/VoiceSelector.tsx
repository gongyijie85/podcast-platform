import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, RadioGroup, FormControlLabel, Radio, Box, Stack, Button } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { ttsApi } from '../../api/tts.api';
import type { TtsVoice, TtsPreviewResult } from '@shared/book';
import { useConfigStore } from '../../store/config.store';
import { useUiStore } from '../../store/ui.store';
import { LoadingButton } from '../../components/feedback/LoadingButton';

interface Props {
  role: 'host' | 'guest';
  value: string;
  onChange: (voiceId: string) => void;
}

const PREVIEW_TEXT = '大家好，欢迎来到本期 AI 播客，我们将一起聊聊这本有趣的好书。';

export function VoiceSelector({ role, value, onChange }: Props): JSX.Element {
  const voices = useConfigStore((s) => s.voices);
  const setVoices = useConfigStore((s) => s.setVoices);
  const recent = useConfigStore((s) => s.recentVoiceIds);
  const pushRecent = useConfigStore((s) => s.pushRecentVoice);
  const push = useUiStore((s) => s.push);
  const [playing, setPlaying] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (voices.length === 0) {
      ttsApi.listVoices().then(setVoices).catch((e) => {
        push(`音色加载失败: ${(e as Error).message}`, 'warning');
        // fallback to preset
        setVoices([
          { id: 'BV001_streaming', name: '沉稳男声', provider: 'volcengine', gender: 'male', description: '新闻播报', language: 'zh-CN' },
          { id: 'BV002_streaming', name: '活力女声', provider: 'volcengine', gender: 'female', description: '轻松活泼', language: 'zh-CN' },
          { id: 'BV005_streaming', name: '知性男声', provider: 'volcengine', gender: 'male', description: '学术', language: 'zh-CN' },
          { id: 'BV007_streaming', name: '温柔女声', provider: 'volcengine', gender: 'female', description: '情感', language: 'zh-CN' },
          { id: 'BV019_streaming', name: '磁性男声', provider: 'volcengine', gender: 'male', description: '旁白', language: 'zh-CN' },
          { id: 'BV033_streaming', name: '醇厚男声', provider: 'volcengine', gender: 'male', description: '纪录', language: 'zh-CN' },
        ]);
      });
    }
    return () => {
      audioEl?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recommended = role === 'host'
    ? voices.filter((v) => v.gender === 'male')
    : voices.filter((v) => v.gender === 'female');

  const handlePreview = async (voice: TtsVoice): Promise<void> => {
    setPlaying(voice.id);
    try {
      const r: TtsPreviewResult = await ttsApi.preview(voice.id, PREVIEW_TEXT);
      audioEl?.pause();
      const a = new Audio(r.url);
      a.onended = () => setPlaying(null);
      a.onerror = () => setPlaying(null);
      setAudioEl(a);
      await a.play();
    } catch (e) {
      push(`试听失败: ${(e as Error).message}`, 'error');
    } finally {
      setPlaying(null);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
          {role === 'host' ? '主持人音色' : '嘉宾音色'}
        </Typography>

        {recent.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary">最近使用</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              {recent.map((id) => {
                const v = voices.find((x) => x.id === id);
                if (!v) return null;
                return (
                  <Button
                    key={id}
                    size="small"
                    variant={value === id ? 'contained' : 'outlined'}
                    onClick={() => {
                      onChange(id);
                      pushRecent(id);
                    }}
                  >
                    {v.name}
                  </Button>
                );
              })}
            </Stack>
          </Box>
        )}

        <RadioGroup
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            pushRecent(e.target.value);
          }}
        >
          <Stack>
            {recommended.map((v) => (
              <Stack key={v.id} direction="row" alignItems="center" sx={{ py: 0.5 }}>
                <FormControlLabel
                  value={v.id}
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={500}>{v.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {v.description}
                      </Typography>
                    </Box>
                  }
                  sx={{ flex: 1 }}
                />
                <LoadingButton
                  size="small"
                  loading={playing === v.id}
                  onClick={() => handlePreview(v)}
                  startIcon={<PlayArrowIcon />}
                >
                  试听
                </LoadingButton>
              </Stack>
            ))}
          </Stack>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
