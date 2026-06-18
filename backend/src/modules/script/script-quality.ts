import type { BookMetadata } from '@shared/book';
import type { ScriptQualityReportDto, ScriptSegmentDto } from '@shared/script';

const FILLER_PHRASES = ['嗯', '没错', '非常有看点', '那我们就开始吧', '好的', '哇', '拜拜'];
const CROSS_BOOK_MARKERS = ['对照', '比较', '相比', '共同', '不同', '放在一起', '互相照亮', '一方面', '另一方面'];

export function analyzeScriptQuality(
  books: BookMetadata[],
  segments: ScriptSegmentDto[],
): ScriptQualityReportDto {
  const text = segments.map((segment) => segment.text).join('\n');
  const normalizedText = normalizeTitleText(text);
  const bookCoverage = books.map((book) => {
    const variants = bookTitleVariants(book.title);
    const mentionCount = variants.reduce((max, variant) => Math.max(max, countPhrase(normalizedText, variant)), 0);
    const hasSubstantiveLine = segments.some((segment) => {
      const normalizedLine = normalizeTitleText(segment.text);
      return variants.some((variant) => phraseAppears(normalizedLine, variant)) && segment.text.trim().length >= 40;
    });
    return {
      title: book.title,
      mentionCount,
      mentioned: mentionCount > 0,
      hasSubstantiveLine,
      summaryAvailable: Boolean(book.summary?.trim()),
    };
  });

  const fillerPhraseCount = FILLER_PHRASES.reduce((sum, phrase) => sum + countRawPhrase(text, phrase), 0);
  const hasCrossBookComparison =
    books.length <= 1 ||
    CROSS_BOOK_MARKERS.some((marker) => text.includes(marker)) ||
    bookCoverage.filter((item) => item.mentioned).length >= 2 && text.includes('经典');

  const titleIntegrityWarnings = bookCoverage
    .filter((item) => !item.mentioned)
    .map((item) => `《${item.title}》没有在脚本中按原书名出现，可能遗漏或改写了书名。`);
  const groundednessWarnings = bookCoverage
    .filter((item) => !item.summaryAvailable)
    .map((item) => `《${item.title}》缺少真实简介，脚本只能基于书名和作者，事实边界较弱。`);
  const warnings: string[] = [
    ...bookCoverage
      .filter((item) => !item.hasSubstantiveLine)
      .map((item) => `《${item.title}》缺少足够具体的讨论台词。`),
    ...(hasCrossBookComparison ? [] : ['多书节目缺少明确的跨书比较。']),
    ...(fillerPhraseCount > 6 ? [`空转口头禅出现 ${fillerPhraseCount} 次，建议返修减少附和词。`] : []),
    ...titleIntegrityWarnings,
    ...groundednessWarnings,
  ];

  return {
    status: warnings.length > 0 ? 'warning' : 'pass',
    warnings: Array.from(new Set(warnings)),
    bookCoverage,
    hasCrossBookComparison,
    fillerPhraseCount,
    titleIntegrityWarnings,
    groundednessWarnings,
  };
}

function bookTitleVariants(title: string): string[] {
  const withoutParenthetical = title.replace(/\s*[\(（][^)）]*[\)）]\s*/g, ' ').trim();
  const beforeColon = title.split(':')[0]?.trim();
  const beforeDash = title.split(/[—–-]/)[0]?.trim();
  return Array.from(new Set([title, withoutParenthetical, beforeColon, beforeDash].map(normalizeTitleText)))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

function normalizeTitleText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countPhrase(text: string, phrase: string): number {
  if (!phrase) return 0;
  if (/^[a-z0-9 ]+$/.test(phrase)) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return Array.from(text.matchAll(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'g'))).length;
  }
  return text.split(phrase).length - 1;
}

function countRawPhrase(text: string, phrase: string): number {
  return text.split(phrase).length - 1;
}

function phraseAppears(text: string, phrase: string): boolean {
  return countPhrase(text, phrase) > 0;
}
