import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { XiaomiMimoAdapter } from '../src/modules/tts/adapters/xiaomi-mimo.adapter';

jest.mock('axios');

const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>;

const cfg = (apiKey = 'test-key', format = 'mp3'): ConfigService =>
  ({
    get: (key: string) => {
      const map: Record<string, string> = {
        'thirdParty.mimoTts.apiKey': apiKey,
        'thirdParty.mimoTts.endpoint': 'https://token-plan-sgp.xiaomimimo.com/v1',
        'thirdParty.mimoTts.model': 'mimo-v2.5-tts',
        'thirdParty.mimoTts.format': format,
      };
      return map[key];
    },
  }) as unknown as ConfigService;

describe('XiaomiMimoAdapter', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('lists Xiaomi MiMo voices first-class as xiaomi provider', async () => {
    const adapter = new XiaomiMimoAdapter(cfg());
    const voices = await adapter.listVoices();
    expect(voices.map((voice) => voice.id)).toEqual(expect.arrayContaining(['冰糖', '茉莉', '苏打', '白桦']));
    expect(voices.every((voice) => voice.provider === 'xiaomi')).toBe(true);
  });

  it('calls Token Plan OpenAI-compatible chat completions for TTS audio', async () => {
    mockedPost.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              audio: {
                data: Buffer.from('fake-mp3').toString('base64'),
                transcript: '测试音频',
              },
            },
          },
        ],
      },
    });

    const adapter = new XiaomiMimoAdapter(cfg('test-key', 'mp3'));
    const result = await adapter.synthesize('测试音频', '冰糖');

    expect(result.buffer.equals(Buffer.from('fake-mp3'))).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(1000);
    expect(mockedPost).toHaveBeenCalledWith(
      'https://token-plan-sgp.xiaomimimo.com/v1/chat/completions',
      {
        model: 'mimo-v2.5-tts',
        modalities: ['text', 'audio'],
        messages: [{ role: 'assistant', content: '测试音频' }],
        audio: { voice: '冰糖', format: 'mp3' },
        stream: false,
      },
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('falls back to deterministic silence when no API key is configured', async () => {
    const adapter = new XiaomiMimoAdapter(cfg('', 'mp3'));
    const result = await adapter.synthesize('没有 key 时生成静音占位。', '茉莉');

    expect(mockedPost).not.toHaveBeenCalled();
    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(result.durationMs).toBeGreaterThanOrEqual(1000);
  });
});
