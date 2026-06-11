import { MERGE_MODE_SYSTEM_PROMPT } from './six-segment.template';

export const MERGE_MODE_USER_TEMPLATE = (
  title: string,
  books: Array<{ title: string; author: string; summary?: string | null }>,
) =>
  `请把以下 ${books.length} 本书融合到一期播客"${title}"中：\n\n${books
    .map(
      (b, i) =>
        `第${i + 1}章：${b.title} - ${b.author}${b.summary ? `\n简介：${b.summary.slice(0, 200)}` : ''}`,
    )
    .join('\n\n')}\n\n请输出纯 JSON 数组。`;

export { MERGE_MODE_SYSTEM_PROMPT };
