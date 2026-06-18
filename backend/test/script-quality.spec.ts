import { analyzeScriptQuality } from '../src/modules/script/script-quality';
import type { BookMetadata } from '@shared/book';
import type { ScriptSegmentDto } from '@shared/script';

const books: BookMetadata[] = [
  {
    isbn: '9780061120084',
    title: 'To Kill a Mockingbird',
    author: 'Harper Lee',
    summary: 'A story about justice, race, childhood, and moral courage.',
    source: 'openlibrary',
  },
  {
    isbn: '9780743273565',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    summary: 'A Jazz Age novel about wealth, desire, illusion, and social class.',
    source: 'openlibrary',
  },
];

const segment = (text: string, orderIndex: number): ScriptSegmentDto => ({
  id: `s-${orderIndex}`,
  scriptId: 'script-1',
  orderIndex,
  speaker: orderIndex % 2 === 0 ? 'host' : 'guest',
  text,
  emotion: '平缓',
  stage: orderIndex < 2 ? 'intro' : 'interpret',
  startTime: null,
  endTime: null,
});

describe('analyzeScriptQuality', () => {
  it('passes when every book is covered and the script compares books', () => {
    const report = analyzeScriptQuality(books, [
      segment('今天从《To Kill a Mockingbird》和《The Great Gatsby》共同讨论正义、阶层和幻灭。', 0),
      segment('《To Kill a Mockingbird》提供公共正义的入口，它让我们看到偏见如何影响法律和童年经验。', 1),
      segment('相比之下，《The Great Gatsby》把欲望、财富和阶层幻觉放到爵士时代的社会空气里。', 2),
      segment('这两本书的跨书对照，是一个更偏公共伦理，一个更偏私人欲望，但都在追问美国理想。', 3),
    ]);

    expect(report.status).toBe('pass');
    expect(report.hasCrossBookComparison).toBe(true);
    expect(report.bookCoverage.every((item) => item.hasSubstantiveLine)).toBe(true);
  });

  it('warns about missing books, weak cross-book comparison, filler, and missing summaries', () => {
    const report = analyzeScriptQuality(
      [{ ...books[0], summary: null }, books[1]],
      [
        segment('嗯，今天我们聊《To Kill a Mockingbird》，没错没错，这个非常有看点。好的，那我们就开始吧。', 0),
      ],
    );

    expect(report.status).toBe('warning');
    expect(report.hasCrossBookComparison).toBe(false);
    expect(report.fillerPhraseCount).toBeGreaterThan(3);
    expect(report.titleIntegrityWarnings.join('\n')).toContain('The Great Gatsby');
    expect(report.groundednessWarnings.join('\n')).toContain('To Kill a Mockingbird');
    expect(report.warnings.join('\n')).toContain('缺少明确的跨书比较');
  });
});
