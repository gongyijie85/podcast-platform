import type { ScriptTemplate } from '@shared/project';
import { MERGE_MODE_SYSTEM_PROMPT, SCRIPT_TEMPLATE_GUIDANCE } from './six-segment.template';

export const MERGE_MODE_USER_TEMPLATE = (
  title: string,
  books: Array<{ title: string; author: string; summary?: string | null; podcastAngle?: string | null }>,
  scriptTemplate: ScriptTemplate = 'default',
) =>
  `请把以下 ${books.length} 本书融合到一期播客"${title}"中：\n\n脚本风格：${SCRIPT_TEMPLATE_GUIDANCE[scriptTemplate]}\n\n${books
    .map(
      (b, i) =>
        `书目${i + 1}：${b.title} - ${b.author}${b.summary ? `\n真实简介：${b.summary.slice(0, 280)}` : ''}${
          b.podcastAngle ? `\n播客切入点：${b.podcastAngle.slice(0, 160)}` : ''
        }`,
    )
    .join('\n\n')}\n\n融合要求：\n- 这不是逐本复述简介，也不是书单播报。请设计一个能串联所有书的节目问题，并让主持人和嘉宾围绕这个问题推进。\n- ${
      books.length > 10
        ? `本期有 ${books.length} 本书，请按 3-5 个主题簇组织；每本书至少用完整书名进入主线 1 次，并说明它在主题簇中的作用。`
        : '每本书至少出现 2 次；每本书至少有 1 条台词说明它如何回答节目问题。'
    }\n- 书名必须逐字沿用上方"书目"中的 title，不能把英文词替换成相似词，不能改成另一本看似相关的书名。\n- 首次提及每本书时使用《完整书名》；带副标题或括号的书，后续可用核心标题简称，但核心标题不能变。\n- 必须有跨书比较：共同主题、关键差异、人物/概念的互相照亮、现实启发。\n- 大批量书目时要做主题分组，不要逐本流水账；控制整体在 10-14 条高信息密度台词内。\n- 如果两本书主题不同，请找到更高层的问题，例如"经典作品如何处理理想、阶层、正义与幻灭"。\n- 避免"嗯""对""没错""很有看点"等空转口头禅；不要用泛泛赞美代替观点。\n- 输出仍按 intro、introduce、interpret、review、suggest、closing 六类 stage 分布，不要真的写章节标题。\n\n请输出纯 JSON 对象，格式为 {"segments":[...]}。`;

export { MERGE_MODE_SYSTEM_PROMPT };
