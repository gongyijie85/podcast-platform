import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TtsAdapter } from './tts.adapter';
import type { TtsPreviewResult, TtsVoice } from '@shared/book';

/**
 * MockTtsAdapter — returns a deterministic 1-second silent MP3 buffer.
 *
 * The buffer is the `silence-1s.mp3` fixture (pre-baked via ffmpeg at TP1).
 * Every call returns the SAME bytes (determinism is required by TP2 spec
 * `mock-tts-adapter.spec.ts` case 1). Duration is fixed at 1000ms because
 * the fixture is exactly 1 second of silence at 44.1kHz mono.
 *
 * This adapter implements the v1.0 `TtsAdapter` interface (synthesize /
 * listVoices / preview) so the v1.1 flow layer can swap it in via
 * `TTS_ADAPTER` InjectionToken without changing any consumer code.
 */
@Injectable()
export class MockTtsAdapter implements TtsAdapter {
  readonly name = 'mock-tts';
  private readonly logger = new Logger(MockTtsAdapter.name);
  private readonly silenceBuffer: Buffer;
  private readonly VOICES: TtsVoice[] = [
    { id: 'mock-host', name: 'Mock 主持人', provider: 'mock', gender: 'female', description: 'Mock 模式占位音色', language: 'zh-CN' },
    { id: 'mock-guest', name: 'Mock 嘉宾', provider: 'mock', gender: 'male', description: 'Mock 模式占位音色', language: 'zh-CN' },
  ];

  constructor() {
    // In dev, `process.cwd()` is the `backend/` directory.
    // In the Docker container, the WORKDIR is `/app/backend/`.
    // Both have `src/test/fixtures/` as a child of CWD.
    const fixturePath = path.resolve(
      process.cwd(),
      'src',
      'test',
      'fixtures',
      'silence-1s.mp3',
    );
    if (!fs.existsSync(fixturePath)) {
      throw new Error(
        `MockTtsAdapter: silence-1s.mp3 fixture not found at ${fixturePath}. ` +
          `Run the TP1 setup command to regenerate it.`,
      );
    }
    this.silenceBuffer = fs.readFileSync(fixturePath);
    this.logger.log(`MockTtsAdapter loaded ${this.silenceBuffer.length} bytes of silence`);
  }

  async listVoices(): Promise<TtsVoice[]> {
    return [...this.VOICES];
  }

  async synthesize(
    _text: string,
    voiceId: string,
    _options?: { emotion?: string },
  ): Promise<{ buffer: Buffer; durationMs: number }> {
    if (!voiceId) {
      throw new Error('TTS_INVALID_INPUT: voiceId 不能为空');
    }
    if (!this.VOICES.find((v) => v.id === voiceId)) {
      // v1.1 is permissive: unknown voices are still synthesised, but logged
      // loudly. This matches v1.0 mock behaviour and keeps callers unblocked.
      this.logger.warn(`MockTtsAdapter: unknown voiceId "${voiceId}", using default buffer anyway`);
    }
    return { buffer: this.silenceBuffer, durationMs: 1000 };
  }

  async preview(text: string, voiceId: string): Promise<TtsPreviewResult> {
    const synth = await this.synthesize(text, voiceId);
    return {
      url: `data:audio/mpeg;base64,${synth.buffer.toString('base64')}`,
      durationMs: synth.durationMs,
      format: 'mp3',
    };
  }
}
