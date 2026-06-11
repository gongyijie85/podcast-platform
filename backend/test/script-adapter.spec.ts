import { DoubaoAdapter } from '../src/modules/script/adapters/doubao.adapter';
import { ConfigService } from '@nestjs/config';

const cfg = (): ConfigService =>
  ({
    get: (k: string) => {
      const map: Record<string, string> = {
        'thirdParty.doubao.apiKey': '',
        'thirdParty.doubao.endpoint': 'https://ark.invalid',
        'thirdParty.doubao.model': 'doubao-pro-32k',
      };
      return map[k];
    },
  }) as unknown as ConfigService;

describe('DoubaoAdapter (mock mode)', () => {
  it('returns deterministic 6-segment script in mock mode', async () => {
    const a = new DoubaoAdapter(cfg());
    const segs = await a.generateScript({
      projectId: 'p1',
      title: '测试',
      mode: 'independent',
      books: [{ isbn: '9787121362200', title: '人类简史', author: '尤瓦尔', source: 'mock' }],
      template: 'standard',
    });
    expect(segs.length).toBeGreaterThanOrEqual(20);
    const stages = new Set(segs.map((s) => s.stage));
    expect(stages.has('intro')).toBe(true);
    expect(stages.has('closing')).toBe(true);
    for (const s of segs) {
      expect(['host', 'guest']).toContain(s.speaker);
      expect(s.text.length).toBeGreaterThan(0);
    }
  });
});
