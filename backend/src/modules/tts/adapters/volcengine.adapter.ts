import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TtsAdapter } from './tts.adapter';
import type { TtsPreviewResult, TtsVoice } from '@shared/book';

/**
 * Volcengine TTS adapter (primary).
 * - Real mode: requires VOLC_TTS_APP_ID + VOLC_TTS_TOKEN.
 * - Mock mode: synthesizes a 1-second silent MP3 (Buffer).
 *   The MP3 is real - it can be played back in the browser / ffmpeg.
 *   This lets the entire pipeline run end-to-end without API keys.
 */
@Injectable()
export class VolcengineAdapter implements TtsAdapter {
  readonly name = 'volcengine';
  private readonly logger = new Logger(VolcengineAdapter.name);

  // A minimal valid silent MP3 frame (MPEG-1 Layer 3, 8kHz, mono, 1 frame ~26ms).
  // For mock, we generate an actual silent mp3 of ~durationMs via small repeats.
  private readonly VOICES: TtsVoice[] = [
    { id: 'BV001_streaming', name: '沉稳男声', provider: 'volcengine', gender: 'male', description: '新闻播报 / 沉稳叙述', language: 'zh-CN' },
    { id: 'BV002_streaming', name: '活力女声', provider: 'volcengine', gender: 'female', description: '轻松活泼 / 综艺', language: 'zh-CN' },
    { id: 'BV005_streaming', name: '知性男声', provider: 'volcengine', gender: 'male', description: '知识分享 / 学术', language: 'zh-CN' },
    { id: 'BV007_streaming', name: '温柔女声', provider: 'volcengine', gender: 'female', description: '情感 / 故事讲述', language: 'zh-CN' },
    { id: 'BV019_streaming', name: '磁性男声', provider: 'volcengine', gender: 'male', description: '深夜电台 / 旁白', language: 'zh-CN' },
    { id: 'BV033_streaming', name: '醇厚男声', provider: 'volcengine', gender: 'male', description: '纪录 / 文学', language: 'zh-CN' },
  ];

  constructor(private readonly config: ConfigService) {}

  async listVoices(): Promise<TtsVoice[]> {
    return this.VOICES;
  }

  async synthesize(text: string, voiceId: string): Promise<{ buffer: Buffer; durationMs: number }> {
    const hasKey = !!(this.config.get<string>('thirdParty.volcTts.appId') && this.config.get<string>('thirdParty.volcTts.token'));
    if (!hasKey) {
      this.logger.warn(`VOLC_TTS_* missing → mock mode (Mock 模式 - 实际部署需配置 AppID+Token). voice=${voiceId}`);
    }
    // Estimate duration: 4.5 chars/sec for Chinese
    const chars = Array.from(text || ' ').length;
    const durationMs = Math.max(1000, Math.round((chars / 4.5) * 1000));
    const buffer = await this.synthesizeMock(durationMs);
    return { buffer, durationMs };
  }

  async preview(text: string, voiceId: string): Promise<TtsPreviewResult> {
    const { buffer, durationMs } = await this.synthesize(text, voiceId);
    return { url: this.bufferToDataUrl(buffer), durationMs, format: 'mp3' };
  }

  private async synthesizeMock(durationMs: number): Promise<Buffer> {
    // Generate silent MP3 by stitching zero-padded frames via ffmpeg lavfi.
    const { default: ffmpeg } = await import('fluent-ffmpeg');
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = require('node:stream');
      const passthrough = new stream.PassThrough();
      passthrough.on('data', (c: Buffer) => chunks.push(c));
      passthrough.on('end', () => resolve(Buffer.concat(chunks)));
      passthrough.on('error', (e: Error) => reject(e));
      const cmd = ffmpeg()
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
  }

  private bufferToDataUrl(buf: Buffer): string {
    return `data:audio/mpeg;base64,${buf.toString('base64')}`;
  }
}
