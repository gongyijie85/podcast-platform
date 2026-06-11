import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Card,
  CardContent,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  Stack,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  type SelectChangeEvent,
} from '@mui/material';
import { ttsApi } from '../../api/tts.api';
import { useConfigStore } from '../../store/config.store';
import { useUiStore } from '../../store/ui.store';
import { PRESET_VOICES, DEFAULT_HOST_VOICE_ID, DEFAULT_GUEST_VOICE_ID } from '../../constants/voices';
import { TTSPreview } from './TTSPreview';
import type { TtsVoice } from '@shared/book';
import { EMOTIONS } from '../../constants/emotions';
import type { ScriptEmotion } from '@shared/script';

interface Props {
  role: 'host' | 'guest';
  value: string;
  emotion?: ScriptEmotion;
  onChange: (voiceId: string) => void;
  onEmotionChange?: (e: ScriptEmotion) => void;
}

/**
 * Pick a TTS voice for a given role. Hosts default to male, guests to female.
 * Shows a preview button and (optionally) a per-voice emotion selector.
 */
export function VoiceSelector({ role, value, emotion, onChange, onEmotionChange }: Props): JSX.Element {
  const { t } = useTranslation();
  const voices = useConfigStore((s) => s.voices);
  const setVoices = useConfigStore((s) => s.setVoices);
  const push = useUiStore((s) => s.push);
  const [emotionDraft, setEmotionDraft] = useState<ScriptEmotion>(emotion ?? '平缓');

  useEffect(() => {
    if (voices.length === 0) {
      ttsApi.listVoices()
        .then((list) => {
          setVoices(list.length > 0 ? list : PRESET_VOICES);
        })
        .catch(() => {
          setVoices(PRESET_VOICES);
          push(t('common.loading') + '…fallback', 'info');
        });
    }
  }, [voices.length, setVoices, push, t]);

  const recommended = role === 'host'
    ? voices.filter((v) => v.gender === 'male')
    : voices.filter((v) => v.gender === 'female');

  const list: TtsVoice[] = recommended.length > 0 ? recommended : voices;
  const fallbackId = role === 'host' ? DEFAULT_HOST_VOICE_ID : DEFAULT_GUEST_VOICE_ID;

  const handleEmotion = (e: SelectChangeEvent<ScriptEmotion>): void => {
    const next = e.target.value as ScriptEmotion;
    setEmotionDraft(next);
    onEmotionChange?.(next);
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {role === 'host' ? t('config.hostVoice') : t('config.guestVoice')}
          </Typography>
          <Chip
            size="small"
            label={role === 'host' ? 'HOST' : 'GUEST'}
            color={role === 'host' ? 'primary' : 'secondary'}
            variant="outlined"
          />
        </Stack>

        <FormControl size="small" fullWidth sx={{ mb: 2 }}>
          <InputLabel id={`emotion-${role}-label`}>情感</InputLabel>
          <Select<ScriptEmotion>
            labelId={`emotion-${role}-label`}
            label="情感"
            value={emotionDraft}
            onChange={handleEmotion}
          >
            {EMOTIONS.map((e) => (
              <MenuItem key={e.key} value={e.key}>
                <Box component="span" sx={{ mr: 1 }}>{e.emoji}</Box>
                {e.key}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <RadioGroup
          value={value || fallbackId}
          onChange={(e) => onChange(e.target.value as string)}
        >
          <Stack>
            {list.map((v) => {
              const selected = (value || fallbackId) === v.id;
              return (
                <Stack
                  key={v.id}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    py: 0.75,
                    px: 1,
                    borderRadius: 1,
                    bgcolor: selected ? 'primary.50' : 'transparent',
                    '&:hover': { bgcolor: 'grey.50' },
                  }}
                >
                  <FormControlLabel
                    value={v.id}
                    control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2" fontWeight={selected ? 600 : 500}>
                          {v.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {v.description} · {v.provider}
                        </Typography>
                      </Box>
                    }
                    sx={{ flex: 1, m: 0 }}
                  />
                  <TTSPreview
                    voice={v}
                    emotion={emotionDraft}
                    text={`${role === 'host' ? '大家好' : '大家好'}，我是${role === 'host' ? '主持人' : '嘉宾'}，欢迎收听本期播客。`}
                  />
                </Stack>
              );
            })}
            {list.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                暂无可用音色
              </Typography>
            )}
          </Stack>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
