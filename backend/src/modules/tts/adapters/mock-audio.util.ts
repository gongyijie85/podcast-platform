import * as fs from 'node:fs';
import * as path from 'node:path';

export function estimateSpeechDurationMs(text: string): number {
  const chars = Array.from(text || ' ').length;
  return Math.max(1000, Math.round((chars / 4.5) * 1000));
}

export function loadSilenceFixture(): Buffer {
  const fixturePath = path.resolve(process.cwd(), 'src', 'test', 'fixtures', 'silence-1s.mp3');
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`silence-1s.mp3 fixture not found at ${fixturePath}`);
  }
  return fs.readFileSync(fixturePath);
}

export function synthesizeMockSilence(text: string): { buffer: Buffer; durationMs: number } {
  const durationMs = estimateSpeechDurationMs(text);
  const silence = loadSilenceFixture();
  const repeats = Math.max(1, Math.ceil(durationMs / 1000));
  return {
    buffer: Buffer.concat(Array.from({ length: repeats }, () => silence)),
    durationMs,
  };
}
