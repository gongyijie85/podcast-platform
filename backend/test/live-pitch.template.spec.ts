import { LIVE_PITCH_USER_TEMPLATE } from '../src/modules/book/prompts/live-pitch.template';
import type { BookLibraryItem } from '@shared/book';

describe('LIVE_PITCH_USER_TEMPLATE', () => {
  it('includes enrichment signals when present', () => {
    const text = LIVE_PITCH_USER_TEMPLATE({
      isbn: '9780375811746',
      title: 'Flipped',
      author: 'Wendelin Van Draanen',
      source: 'googlebooks',
      titleZh: '怦然心动',
      authorZh: '文德琳·范·德拉安南',
      summaryZh: '关于青春、误解和成长的故事。',
      enrichment: {
        ratings: [{ label: 'Goodreads', score: 4, count: 128823, source: 'goodreads', fetchedAt: '2026-07-08T00:00:00.000Z' }],
        reviewInsights: {
          positives: ['真诚温暖', '适合青少年'],
          concerns: ['节奏较慢'],
          source: 'manual',
          fetchedAt: '2026-07-08T00:00:00.000Z',
        },
        hostBriefZh: {
          sellingPoints: ['双视角叙事'],
          audience: ['亲子共读'],
          talkingAngles: ['从青春误会切入'],
        },
      },
      id: 'id',
      queryCount: 1,
      metadataSyncStatus: 'synced',
      metadataSyncAttempts: 0,
      firstSeenAt: '2026-07-08T00:00:00.000Z',
      lastSeenAt: '2026-07-08T00:00:00.000Z',
    } as BookLibraryItem);

    expect(text).toContain('评分背书：Goodreads：4分，128823条评价');
    expect(text).toContain('主播卖点：双视角叙事');
    expect(text).toContain('读者好评摘要：真诚温暖；适合青少年');
    expect(text).toContain('常见顾虑：节奏较慢');
  });
});
