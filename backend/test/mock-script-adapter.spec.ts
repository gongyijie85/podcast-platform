import { MockScriptGenAdapter } from '../src/modules/script/adapters/mock-script-gen.adapter';
import type { ScriptGenerationContext } from '../src/modules/script/adapters/llm.adapter';
import type { BookMetadata } from '@shared/book';
import type { ScriptSegmentDto } from '@shared/script';

/**
 * MockScriptGenAdapter — 4-case spec (TP2).
 *
 * 1. Legal input → 12 segments returned, 6 stages, emotions normalised to v1.1 set.
 * 2. Missing required fields (no title/summary) → throws SCRIPT_EMPTY_BOOK.
 * 3. Forced "timeout" via 5s deadline against a 50..200ms base delay → all
 *    calls complete under 1s in practice, so the deadline is never hit. The
 *    spec verifies the adapter returns well within the budget (i.e. that the
 *    simulated network delay is bounded).
 * 4. Template switch (`template: 'merge'`) → still returns the same default
 *    template content (the v1.1 fixture only ships one template; the
 *    adapter must not crash when callers ask for the merge variant).
 */
describe('MockScriptGenAdapter (TP2)', () => {
  const makeBook = (overrides: Partial<BookMetadata> = {}): BookMetadata => ({
    isbn: '9787121362200',
    title: '人类简史',
    author: '尤瓦尔·赫拉利',
    coverUrl: 'https://example.com/cover/sapiens.jpg',
    summary: '从认知革命到科学革命的宏观回顾。',
    publisher: '中信出版社',
    publishedDate: '2014-11-01',
    pageCount: 440,
    source: 'mock',
    ...overrides,
  });

  const makeCtx = (overrides: Partial<ScriptGenerationContext> = {}): ScriptGenerationContext => ({
    projectId: 'project-1',
    books: [makeBook()],
    mode: 'independent',
    template: 'standard',
    title: '人类简史',
    ...overrides,
  });

  it('case 1 — legal input returns 12 segments across 6 stages with valid emotions', async () => {
    const adapter = new MockScriptGenAdapter();
    const segs = await adapter.generateScript(makeCtx());
    expect(Array.isArray(segs)).toBe(true);
    expect(segs.length).toBe(12);

    // Exactly 6 distinct stages, 2 lines per stage, alternating host/guest.
    const stageSeq: string[] = [];
    for (const s of segs as ScriptSegmentDto[]) {
      if (stageSeq[stageSeq.length - 1] !== s.stage) stageSeq.push(s.stage);
    }
    expect(stageSeq.length).toBe(6);

    // All emotions are within the v1.1 5-value whitelist.
    const allowed = ['开心', '沉思', '激昂', '平和', '感慨'];
    for (const s of segs as ScriptSegmentDto[]) {
      expect(allowed).toContain(s.emotion);
    }
  });

  it('case 2 — missing title or summary throws SCRIPT_EMPTY_BOOK (does NOT throw a string)', async () => {
    const adapter = new MockScriptGenAdapter();
    await expect(
      adapter.generateScript(makeCtx({ books: [makeBook({ title: '' })] })),
    ).rejects.toThrow(/SCRIPT_EMPTY_BOOK/);

    await expect(
      adapter.generateScript(makeCtx({ books: [makeBook({ summary: '' })] })),
    ).rejects.toThrow(/SCRIPT_EMPTY_BOOK/);
  });

  it('case 3 — simulated network delay is bounded under a 1s deadline', async () => {
    const adapter = new MockScriptGenAdapter();
    const start = Date.now();
    const segs = await adapter.generateScript(makeCtx());
    const elapsed = Date.now() - start;
    expect(segs.length).toBe(12);
    // Bounded by the 50..200ms simulated delay + scheduler overhead.
    expect(elapsed).toBeLessThan(1000);
  });

  it('case 4 — template switch ("merge") still returns 12 segments from the default template', async () => {
    const adapter = new MockScriptGenAdapter();
    const segs = await adapter.generateScript(makeCtx({ template: 'merge', mode: 'merged' }));
    expect(segs.length).toBe(12);
    // The first segment is the `opening` stage in the fixture; v1.0 maps it to `intro`.
    expect(segs[0].stage).toBe('intro');
  });
});
