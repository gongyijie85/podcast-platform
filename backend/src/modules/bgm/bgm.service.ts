import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BgmTrackDto, BgmCategory } from '@shared/book';

const execFileAsync = promisify(execFile);

const SEED: Array<Omit<BgmTrackDto, 'url'>> = [
  // 轻松
  { id: 'bgm-relax-1', name: '春日漫步', category: '轻松', storageKey: 'bgm/relax/spring.mp3', durationMs: 60_000 },
  { id: 'bgm-relax-2', name: '午后咖啡', category: '轻松', storageKey: 'bgm/relax/coffee.mp3', durationMs: 60_000 },
  { id: 'bgm-relax-3', name: '微风小镇', category: '轻松', storageKey: 'bgm/relax/breeze.mp3', durationMs: 60_000 },
  // 科技
  { id: 'bgm-tech-1', name: '数据流', category: '科技', storageKey: 'bgm/tech/data.mp3', durationMs: 60_000 },
  { id: 'bgm-tech-2', name: '未来已来', category: '科技', storageKey: 'bgm/tech/future.mp3', durationMs: 60_000 },
  { id: 'bgm-tech-3', name: '代码之夜', category: '科技', storageKey: 'bgm/tech/coding.mp3', durationMs: 60_000 },
  // 人文
  { id: 'bgm-human-1', name: '远山', category: '人文', storageKey: 'bgm/human/far.mp3', durationMs: 60_000 },
  { id: 'bgm-human-2', name: '老书页', category: '人文', storageKey: 'bgm/human/pages.mp3', durationMs: 60_000 },
  { id: 'bgm-human-3', name: '江南雨', category: '人文', storageKey: 'bgm/human/rain.mp3', durationMs: 60_000 },
  // 纪实
  { id: 'bgm-doc-1', name: '新闻开场', category: '纪实', storageKey: 'bgm/doc/news.mp3', durationMs: 60_000 },
  { id: 'bgm-doc-2', name: '纪录长镜', category: '纪实', storageKey: 'bgm/doc/long.mp3', durationMs: 60_000 },
  { id: 'bgm-doc-3', name: '深度报道', category: '纪实', storageKey: 'bgm/doc/deep.mp3', durationMs: 60_000 },
];

const TRACK_TONES: Record<string, { base: number; harmony: number; pulse: number; noise: number }> = {
  'bgm-relax-1': { base: 261.63, harmony: 329.63, pulse: 392.0, noise: 0.012 },
  'bgm-relax-2': { base: 293.66, harmony: 369.99, pulse: 440.0, noise: 0.01 },
  'bgm-relax-3': { base: 246.94, harmony: 329.63, pulse: 415.3, noise: 0.014 },
  'bgm-tech-1': { base: 220.0, harmony: 440.0, pulse: 880.0, noise: 0.018 },
  'bgm-tech-2': { base: 196.0, harmony: 392.0, pulse: 784.0, noise: 0.016 },
  'bgm-tech-3': { base: 174.61, harmony: 349.23, pulse: 698.46, noise: 0.018 },
  'bgm-human-1': { base: 196.0, harmony: 293.66, pulse: 392.0, noise: 0.012 },
  'bgm-human-2': { base: 174.61, harmony: 261.63, pulse: 349.23, noise: 0.01 },
  'bgm-human-3': { base: 164.81, harmony: 246.94, pulse: 329.63, noise: 0.016 },
  'bgm-doc-1': { base: 146.83, harmony: 220.0, pulse: 440.0, noise: 0.014 },
  'bgm-doc-2': { base: 130.81, harmony: 196.0, pulse: 293.66, noise: 0.012 },
  'bgm-doc-3': { base: 155.56, harmony: 233.08, pulse: 311.13, noise: 0.014 },
};

@Injectable()
export class BgmService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BgmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Best-effort seed. If the DB is unreachable, the app still starts;
    // operators can run `pnpm seed:bgm` once Postgres is up. We intentionally
    // do not throw here, so a missing DATABASE_URL in a fresh dev environment
    // does not prevent the rest of the API from coming online.
    try {
      await this.seed();
    } catch (err) {
      this.logger.warn(
        `BGM seed skipped (DB unavailable): ${(err as Error).message}. ` +
          `Run "pnpm --filter backend seed:bgm" once Postgres is reachable.`,
      );
    }
  }

  async listTracks(): Promise<BgmTrackDto[]> {
    const rows = await this.prisma.bgmTrack.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category as BgmCategory,
      storageKey: r.storageKey,
      durationMs: r.durationMs,
      url: `/api/bgm/tracks/${r.id}/audio`,
    }));
  }

  async listCategories(): Promise<BgmCategory[]> {
    const rows = await this.prisma.bgmTrack.findMany({ distinct: ['category'], select: { category: true } });
    return rows.map((r) => r.category as BgmCategory);
  }

  async seed(): Promise<void> {
    for (const t of SEED) {
      await this.prisma.bgmTrack.upsert({
        where: { id: t.id },
        create: t,
        update: { name: t.name, category: t.category, storageKey: t.storageKey, durationMs: t.durationMs },
      });
      await this.ensureTrackAudio(t).catch((err) => {
        this.logger.warn(`BGM audio seed skipped for ${t.id}: ${(err as Error).message}`);
      });
    }
    this.logger.log(`Seeded ${SEED.length} BGM tracks`);
  }

  async getTrackAudio(trackId: string): Promise<{ buffer: Buffer; filename: string }> {
    const track = await this.prisma.bgmTrack.findUnique({ where: { id: trackId } });
    if (!track) {
      throw new Error(`BGM track not found: ${trackId}`);
    }
    await this.ensureTrackAudio({
      id: track.id,
      name: track.name,
      category: track.category as BgmCategory,
      storageKey: track.storageKey,
      durationMs: track.durationMs,
    });
    return {
      buffer: await this.storage.get(track.storageKey),
      filename: `${track.id}.mp3`,
    };
  }

  async ensureTrackAudio(track: Omit<BgmTrackDto, 'url'>): Promise<void> {
    if (await this.storage.exists(track.storageKey).catch(() => false)) return;
    const buffer = await this.generateFallbackBgm(track.id);
    await this.storage.put(track.storageKey, buffer, 'audio/mpeg');
  }

  private async generateFallbackBgm(trackId: string): Promise<Buffer> {
    const tone = TRACK_TONES[trackId] ?? { base: 220, harmony: 330, pulse: 440, noise: 0.012 };
    const duration = 60;
    const tmpDir = path.resolve(process.cwd(), 'tmp');
    await fs.promises.mkdir(tmpDir, { recursive: true });
    const outFile = path.join(tmpDir, `bgm-${trackId}-${Date.now()}.mp3`);

    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${tone.base}:duration=${duration}:sample_rate=44100`,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${tone.harmony}:duration=${duration}:sample_rate=44100`,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${tone.pulse}:duration=${duration}:sample_rate=44100`,
        '-f',
        'lavfi',
        '-i',
        `anoisesrc=color=pink:duration=${duration}:sample_rate=44100`,
        '-filter_complex',
        `[0:a]volume=0.055[a0];[1:a]volume=0.035[a1];[2:a]volume=0.018,atrim=0:${duration},asetpts=N/SR/TB[a2];[3:a]volume=${tone.noise.toFixed(3)}[n0];[a0][a1][a2][n0]amix=inputs=4:duration=first,afade=t=in:st=0:d=2,afade=t=out:st=${duration - 3}:d=3,alimiter=limit=0.45[out]`,
        '-map',
        '[out]',
        '-ac',
        '2',
        '-b:a',
        '96k',
        outFile,
      ]);
      return await fs.promises.readFile(outFile);
    } finally {
      await fs.promises.unlink(outFile).catch(() => undefined);
    }
  }
}
