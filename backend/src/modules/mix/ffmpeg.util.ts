import * as fs from 'node:fs';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import ffmpeg from 'fluent-ffmpeg';

const execFileAsync = promisify(execFile);

export interface FfmpegResult {
  buffer: Buffer;
  durationMs: number;
}

export class FfmpegUtil {
  /**
   * Run an ffmpeg command and capture the resulting buffer.
   * Uses fluent-ffmpeg pipeline (one-shot, no temp files).
   */
  static async run(
    factory: (cmd: ffmpeg.FfmpegCommand) => ffmpeg.FfmpegCommand,
  ): Promise<FfmpegResult> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const passthrough = new PassThrough();
      passthrough.on('data', (c: Buffer) => chunks.push(c));
      passthrough.on('end', () => resolve({ buffer: Buffer.concat(chunks), durationMs: 0 }));
      passthrough.on('error', (e: Error) => reject(e));
      const cmd = factory(ffmpeg());
      cmd.format('mp3')
        .on('error', (err: Error) => reject(err))
        .stream(passthrough);
    });
  }

  static async concatenateBuffers(buffers: Buffer[]): Promise<Buffer> {
    if (buffers.length === 0) return Buffer.alloc(0);
    if (buffers.length === 1) return buffers[0];

    const tmpDir = path.resolve(process.cwd(), 'tmp');
    await fs.promises.mkdir(tmpDir, { recursive: true });
    const listFile = path.join(tmpDir, `list-${Date.now()}.txt`);
    const outFile = path.join(tmpDir, `concat-${Date.now()}.mp3`);
    const inputs: string[] = [];

    for (let i = 0; i < buffers.length; i++) {
      const p = path.join(tmpDir, `seg-${Date.now()}-${i}.mp3`);
      await fs.promises.writeFile(p, buffers[i]);
      inputs.push(p);
    }
    await fs.promises.writeFile(listFile, inputs.map((p) => `file '${p}'`).join('\n'));
    try {
      await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outFile]);
      return await fs.promises.readFile(outFile);
    } finally {
      await Promise.all(
        [...inputs, listFile, outFile].map((p) => fs.promises.unlink(p).catch(() => undefined)),
      );
    }
  }

  /**
   * Mix voice audio with BGM with volume + fade in/out, and apply peak limiter at -3dB.
   */
  static async mixWithBgm(opts: {
    voice: Buffer;
    bgm: Buffer | null;
    voiceVolume: number; // 0..100
    bgmVolume: number; // 0..100
    fadeInMs: number;
    fadeOutMs: number;
  }): Promise<FfmpegResult> {
    const v = Math.max(0, Math.min(1, opts.voiceVolume / 100));
    const b = opts.bgm ? Math.max(0, Math.min(1, opts.bgmVolume / 100)) : 0;
    const fadeIn = Math.max(0, opts.fadeInMs / 1000);
    const fadeOut = Math.max(0, opts.fadeOutMs / 1000);

    // Write buffers to temp files (fluent-ffmpeg requires a path or Readable).
    const tmpDir = path.resolve(process.cwd(), 'tmp');
    await fs.promises.mkdir(tmpDir, { recursive: true });
    const voiceFile = path.join(tmpDir, `voice-${Date.now()}.mp3`);
    const bgmFile = path.join(tmpDir, `bgm-${Date.now()}.mp3`);
    await fs.promises.writeFile(voiceFile, opts.voice);
    if (opts.bgm) await fs.promises.writeFile(bgmFile, opts.bgm);

    try {
      return await FfmpegUtil.run((cmd) => {
        cmd.input(voiceFile);
        if (opts.bgm) cmd.input(bgmFile);
        const filters: string[] = [];
        filters.push(`[0:a]volume=${v.toFixed(3)}[v0]`);
        if (opts.bgm) {
          filters.push(`[1:a]volume=${b.toFixed(3)},afade=in:st=0:d=${fadeIn},afade=out:st=0:d=${fadeOut}[b0]`);
          filters.push(`[v0][b0]amix=inputs=2:duration=first:dropout_transition=0[ab]`);
        } else {
          filters.push(`[v0]anull[ab]`);
        }
        filters.push(`[ab]alimiter=limit=0.7079[aout]`); // -3dB
        cmd.complexFilter(filters);
        cmd.outputOptions(['-map', '[aout]']);
        return cmd;
      });
    } finally {
      await fs.promises.unlink(voiceFile).catch(() => undefined);
      if (opts.bgm) await fs.promises.unlink(bgmFile).catch(() => undefined);
    }
  }
}
