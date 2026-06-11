import * as fs from 'node:fs';
import * as path from 'node:path';
import { MockTtsAdapter } from '../src/modules/tts/adapters/mock-tts.adapter';

/**
 * MockTtsAdapter — 3-case spec (TP2).
 *
 * 1. Happy path: returns a non-empty buffer and 1000ms duration.
 * 2. Invalid voiceId is non-fatal (mock mode is permissive), but empty
 *    voiceId IS fatal (caller bug).
 * 3. Missing silence-1s.mp3 fixture causes the constructor to throw with
 *    a descriptive error (regression: someone deleting the fixture must
 *    NOT silently break the pipeline).
 */
describe('MockTtsAdapter (TP2)', () => {
  it('case 1 — happy path: synthesize returns a non-empty buffer of 1000ms', async () => {
    const adapter = new MockTtsAdapter();
    const r = await adapter.synthesize('你好', 'mock-host', { emotion: '开心' });
    expect(Buffer.isBuffer(r.buffer)).toBe(true);
    expect(r.buffer.length).toBeGreaterThan(1000);
    expect(r.durationMs).toBe(1000);
  });

  it('case 1b — determinism: multiple calls return the same bytes', async () => {
    const adapter = new MockTtsAdapter();
    const a = await adapter.synthesize('A', 'mock-host');
    const b = await adapter.synthesize('B', 'mock-guest');
    expect(a.buffer.equals(b.buffer)).toBe(true);
  });

  it('case 2 — empty voiceId throws (caller bug, NOT the mock being permissive)', async () => {
    const adapter = new MockTtsAdapter();
    await expect(adapter.synthesize('x', '')).rejects.toThrow(/voiceId/);
  });

  it('case 2b — unknown voiceId is permitted (mock fallback behaviour)', async () => {
    const adapter = new MockTtsAdapter();
    const r = await adapter.synthesize('x', 'not-a-real-voice');
    expect(r.durationMs).toBe(1000);
  });

  it('case 3 — missing silence-1s.mp3 fixture makes the constructor throw', () => {
    // Temporarily move the fixture aside to simulate it being missing.
    const fixturePath = path.resolve(
      __dirname,
      '..',
      'src',
      'test',
      'fixtures',
      'silence-1s.mp3',
    );
    expect(fs.existsSync(fixturePath)).toBe(true);
    const backup = path.join(__dirname, '__silence_backup.mp3');
    fs.copyFileSync(fixturePath, backup);
    fs.unlinkSync(fixturePath);
    try {
      expect(() => new MockTtsAdapter()).toThrow(/silence-1s\.mp3/);
    } finally {
      fs.copyFileSync(backup, fixturePath);
      fs.unlinkSync(backup);
    }
  });
});
