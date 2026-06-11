import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TtsAdapter } from './tts.adapter';
import type { TtsPreviewResult, TtsVoice } from '@shared/book';

/**
 * Azure TTS adapter (fallback). Same mock behavior as Volcengine.
 */
@Injectable()
export class AzureAdapter implements TtsAdapter {
  readonly name = 'azure';
  private readonly logger = new Logger(AzureAdapter.name);

  private readonly VOICES: TtsVoice[] = [
    { id: 'zh-CN-YunxiNeural', name: '云希 (男)', provider: 'azure', gender: 'male', description: '温暖旁白', language: 'zh-CN' },
    { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 (女)', provider: 'azure', gender: 'female', description: '温柔少女', language: 'zh-CN' },
    { id: 'zh-CN-YunyangNeural', name: '云扬 (男)', provider: 'azure', gender: 'male', description: '新闻播报', language: 'zh-CN' },
  ];

  constructor(private readonly config: ConfigService) {}

  async listVoices(): Promise<TtsVoice[]> {
    return this.VOICES;
  }

  async synthesize(text: string, voiceId: string): Promise<{ buffer: Buffer; durationMs: number }> {
    const hasKey = !!this.config.get<string>('thirdParty.azureTts.key');
    if (!hasKey) {
      this.logger.warn(`AZURE_TTS_KEY missing → mock mode (Mock 模式 - 实际部署需配置 Azure Key). voice=${voiceId}`);
    }
    const chars = Array.from(text || ' ').length;
    const durationMs = Math.max(1000, Math.round((chars / 4.5) * 1000));
    const { default: ffmpeg } = await import('fluent-ffmpeg');
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = require('node:stream');
      const passthrough = new stream.PassThrough();
      passthrough.on('data', (c: Buffer) => chunks.push(c));
      passthrough.on('end', () => resolve(Buffer.concat(chunks)));
      passthrough.on('error', (e: Error) => reject(e));
      ffmpeg()
        .input('anullsrc=channel_layout=mono:sample_rate=22050')
        .inputFormat('lavfi')
        .audioCodec('libmp3lame')
        .audioBitrate('64k')
        .audioChannels(1)
        .audioFrequency(22050)
        .duration(durationMs / 1000)
        .format('mp3')
        .on('error', (err: Error) => reject(err))
        .stream(passthrough);
    });
    return { buffer, durationMs };
  }

  async preview(text: string, voiceId: string): Promise<TtsPreviewResult> {
    const { buffer, durationMs } = await this.synthesize(text, voiceId);
    return { url: `data:audio/mpeg;base64,${buffer.toString('base64')}`, durationMs, format: 'mp3' };
  }
}
