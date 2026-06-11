import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { BgmTrackDto, BgmCategory } from '@shared/book';

const SEED: Array<Omit<BgmTrackDto, 'url'>> = [
  // 轻松
  { id: 'bgm-relax-1', name: '春日漫步', category: '轻松', storageKey: 'bgm/relax/spring.mp3', durationMs: 180_000 },
  { id: 'bgm-relax-2', name: '午后咖啡', category: '轻松', storageKey: 'bgm/relax/coffee.mp3', durationMs: 200_000 },
  { id: 'bgm-relax-3', name: '微风小镇', category: '轻松', storageKey: 'bgm/relax/breeze.mp3', durationMs: 195_000 },
  // 科技
  { id: 'bgm-tech-1', name: '数据流', category: '科技', storageKey: 'bgm/tech/data.mp3', durationMs: 220_000 },
  { id: 'bgm-tech-2', name: '未来已来', category: '科技', storageKey: 'bgm/tech/future.mp3', durationMs: 210_000 },
  { id: 'bgm-tech-3', name: '代码之夜', category: '科技', storageKey: 'bgm/tech/coding.mp3', durationMs: 240_000 },
  // 人文
  { id: 'bgm-human-1', name: '远山', category: '人文', storageKey: 'bgm/human/far.mp3', durationMs: 230_000 },
  { id: 'bgm-human-2', name: '老书页', category: '人文', storageKey: 'bgm/human/pages.mp3', durationMs: 260_000 },
  { id: 'bgm-human-3', name: '江南雨', category: '人文', storageKey: 'bgm/human/rain.mp3', durationMs: 200_000 },
  // 纪实
  { id: 'bgm-doc-1', name: '新闻开场', category: '纪实', storageKey: 'bgm/doc/news.mp3', durationMs: 30_000 },
  { id: 'bgm-doc-2', name: '纪录长镜', category: '纪实', storageKey: 'bgm/doc/long.mp3', durationMs: 240_000 },
  { id: 'bgm-doc-3', name: '深度报道', category: '纪实', storageKey: 'bgm/doc/deep.mp3', durationMs: 200_000 },
];

@Injectable()
export class BgmService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BgmService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    }
    this.logger.log(`Seeded ${SEED.length} BGM tracks`);
  }
}
