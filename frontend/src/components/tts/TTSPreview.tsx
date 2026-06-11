import { useState } from 'react';
import { IconButton, Tooltip, CircularProgress } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { ttsApi } from '../../api/tts.api';
import { useUiStore } from '../../store/ui.store';
import type { TtsVoice } from '@shared/book';
import type { ScriptEmotion } from '@shared/script';

interface Props {
  voice: TtsVoice;
  text: string;
  emotion?: ScriptEmotion;
  size?: 'small' | 'medium';
}

/**
 * Inline preview button. Clicking calls ttsApi.preview and plays the returned
 * audio. Clicking again while playing stops the current audio.
 */
export function TTSPreview({ voice, text, emotion, size = 'small' }: Props): JSX.Element {
  const push = useUiStore((s) => s.push);
  const [loading, setLoading] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const stop = (): void => {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
  };

  const play = async (): Promise<void> => {
    if (playing) {
      stop();
      return;
    }
    setLoading(true);
    try {
      const r = await ttsApi.preview(voice.id, text, emotion);
      stop();
      const a = new Audio(r.url);
      a.onended = () => setPlaying(false);
      a.onerror = () => {
        setPlaying(false);
        push('音频加载失败', 'error');
      };
      setAudio(a);
      setPlaying(true);
      await a.play();
    } catch (e) {
      push(e instanceof Error ? `试听失败: ${e.message}` : '试听失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip title={playing ? '停止' : '试听'}>
      <span>
        <IconButton
          onClick={() => void play()}
          size={size}
          color={playing ? 'error' : 'primary'}
          aria-label={playing ? 'stop preview' : 'play preview'}
        >
          {loading ? (
            <CircularProgress size={size === 'small' ? 16 : 20} />
          ) : playing ? (
            <StopIcon fontSize={size} />
          ) : (
            <PlayArrowIcon fontSize={size} />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
}
