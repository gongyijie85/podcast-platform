import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import type { TtsAdapter } from './tts.adapter';
import type { TtsPreviewResult, TtsVoice } from '@shared/book';
import { estimateSpeechDurationMs, synthesizeMockSilence } from './mock-audio.util';

const execFileAsync = promisify(execFile);

type ChatCompletionAudioResponse = {
  choices?: Array<{
    message?: {
      audio?: {
        data?: string;
        transcript?: string;
      };
    };
  }>;
};

@Injectable()
export class XiaomiMimoAdapter implements TtsAdapter {
  readonly name = 'xiaomi';
  private readonly logger = new Logger(XiaomiMimoAdapter.name);

  private readonly VOICES: TtsVoice[] = [
    { id: '冰糖', name: '冰糖', provider: 'xiaomi', gender: 'female', description: '清亮自然，适合主持导读', language: 'zh-CN' },
    { id: '茉莉', name: '茉莉', provider: 'xiaomi', gender: 'female', description: '柔和亲切，适合嘉宾回应', language: 'zh-CN' },
    { id: '苏打', name: '苏打', provider: 'xiaomi', gender: 'male', description: '年轻清爽，适合轻松对谈', language: 'zh-CN' },
    { id: '白桦', name: '白桦', provider: 'xiaomi', gender: 'male', description: '沉稳厚实，适合深度书评', language: 'zh-CN' },
  ];

  constructor(private readonly config: ConfigService) {}

  async listVoices(): Promise<TtsVoice[]> {
    return [...this.VOICES];
  }

  hasVoice(voiceId: string): boolean {
    return this.VOICES.some((voice) => voice.id === this.normalizeVoiceId(voiceId));
  }

  async synthesize(text: string, voiceId: string): Promise<{ buffer: Buffer; durationMs: number }> {
    if (!voiceId) {
      throw new Error('TTS_INVALID_INPUT: voiceId 不能为空');
    }

    const apiKey = this.config.get<string>('thirdParty.mimoTts.apiKey');
    if (!apiKey) {
      this.logger.warn(`MIMO_TTS_API_KEY/LLM_API_KEY missing; Xiaomi MiMo TTS mock mode. voice=${voiceId}`);
      return synthesizeMockSilence(text);
    }

    try {
      return await this.callRealTts(text, voiceId, apiKey);
    } catch (e) {
      this.logger.error(`Xiaomi MiMo TTS API failed, falling back to mock silence: ${(e as Error).message}`);
      return synthesizeMockSilence(text);
    }
  }

  async preview(text: string, voiceId: string): Promise<TtsPreviewResult> {
    const { buffer, durationMs } = await this.synthesize(text, voiceId);
    return { url: `data:audio/mpeg;base64,${buffer.toString('base64')}`, durationMs, format: 'mp3' };
  }

  private async callRealTts(
    text: string,
    voiceId: string,
    apiKey: string,
  ): Promise<{ buffer: Buffer; durationMs: number }> {
    const endpoint = this.config.get<string>('thirdParty.mimoTts.endpoint')!;
    const model = this.config.get<string>('thirdParty.mimoTts.model')!;
    const voice = this.normalizeVoiceId(voiceId);
    const audioFormat = this.config.get<string>('thirdParty.mimoTts.format') || 'wav';

    const resp = await axios.post<ChatCompletionAudioResponse>(
      `${endpoint}/chat/completions`,
      {
        model,
        modalities: ['text', 'audio'],
        messages: [{ role: 'assistant', content: text }],
        audio: {
          voice,
          format: audioFormat,
        },
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 90_000,
      },
    );

    const audioData = resp.data.choices?.[0]?.message?.audio?.data;
    if (!audioData) {
      throw new Error('Empty Xiaomi MiMo TTS audio response');
    }

    const rawAudio = Buffer.from(audioData, 'base64');
    if (rawAudio.length === 0) {
      throw new Error('Xiaomi MiMo TTS returned empty audio buffer');
    }

    if (audioFormat === 'mp3') {
      return { buffer: rawAudio, durationMs: await this.probeDurationMs(rawAudio, 'mp3', text) };
    }

    const mp3 = await this.convertToMp3(rawAudio, audioFormat);
    return { buffer: mp3, durationMs: await this.probeDurationMs(mp3, 'mp3', text) };
  }

  private normalizeVoiceId(voiceId: string): string {
    return voiceId.replace(/^mimo:/, '').trim();
  }

  private async convertToMp3(input: Buffer, inputFormat: string): Promise<Buffer> {
    const tmpDir = path.resolve(process.cwd(), 'tmp', 'tts');
    await fs.mkdir(tmpDir, { recursive: true });
    const id = randomUUID();
    const inputPath = path.join(tmpDir, `${id}.${inputFormat || 'wav'}`);
    const outputPath = path.join(tmpDir, `${id}.mp3`);

    await fs.writeFile(inputPath, input);
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '96k',
        outputPath,
      ]);
      return await fs.readFile(outputPath);
    } finally {
      await fs.unlink(inputPath).catch(() => undefined);
      await fs.unlink(outputPath).catch(() => undefined);
    }
  }

  private async probeDurationMs(buffer: Buffer, format: string, fallbackText: string): Promise<number> {
    const tmpDir = path.resolve(process.cwd(), 'tmp', 'tts');
    await fs.mkdir(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, `${randomUUID()}.${format}`);
    await fs.writeFile(filePath, buffer);
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ]);
      const seconds = Number.parseFloat(stdout.trim());
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.round(seconds * 1000);
      }
    } catch {
      // Fall through to text-based estimate.
    } finally {
      await fs.unlink(filePath).catch(() => undefined);
    }
    return estimateSpeechDurationMs(fallbackText);
  }
}
