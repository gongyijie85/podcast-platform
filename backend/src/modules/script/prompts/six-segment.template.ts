import type { ScriptStage, ScriptEmotion, Speaker } from '@shared/script';
import type { ScriptTemplate } from '@shared/project';

export const SIX_SEGMENT_STAGES: ScriptStage[] = [
  'intro',
  'introduce',
  'interpret',
  'review',
  'suggest',
  'closing',
];

export const EMOTION_POOL: ScriptEmotion[] = ['开心', '沉思', '激昂', '平缓', '温柔', '幽默', '坚定', '紧张'];

export const SIX_SEGMENT_SYSTEM_PROMPT = `你是一位中文播客脚本作家，擅长把书的内容改写成"主持人 + 嘉宾"的双人对谈。
要求：
1. 严格按六段式框架：开场(intro) → 介绍(introduce) → 解读(interpret) → 评价(review) → 建议(suggest) → 收尾(closing)
2. 每段约 250-450 字，整体 1500-3000 字
3. 每条台词必须有 speaker (host|guest)、text、emotion、stage 四个字段
4. 情绪 (emotion) 限定为：开心 | 沉思 | 激昂 | 平缓 | 温柔 | 幽默 | 坚定 | 紧张
5. 必须输出合法 JSON 对象，格式为 {"segments":[...]}，不要任何额外说明
6. 台词口语化、生活化、避免书面语和长句
7. 主持人 (host) 负责引导话题；嘉宾 (guest) 负责深度解读
8. 如果参考书目超过一本，必须让每一本书都进入节目主线，不能只讲第一本书；开场要提出一个能串起所有书的共同问题
9. 不要机械复述简介。每一段都要推进一个新观点：背景、冲突、人物/概念、价值判断、现实启发
10. 禁止用"嗯""对""没错""非常有看点""那我们就开始吧"这类空转口头禅凑字数；每句台词都必须包含有效信息或明确追问
11. 书名必须严格沿用参考书目中的原始 title，不能改写、误译、替换成相似书名；首次提及每本书时使用《完整书名》
`;

export const SCRIPT_TEMPLATE_GUIDANCE: Record<ScriptTemplate, string> = {
  default: '采用清晰、自然的导读节奏，兼顾信息密度和可听性。',
  'deep-review': '采用深度书评风格，强化观点判断、论证依据、争议点和现实反思。',
  'casual-talk': '采用轻松对谈风格，语气更口语、更有来回感，适合泛听场景。',
  academic: '采用学术解读风格，突出概念脉络、问题意识、理论框架和审慎表达。',
  'audio-overview': '采用资料 grounded 的 AI 深潜播客风格：先给节目问题和听众承诺，再用追问、解释、跨书比较和现实启发层层推进。',
};

export const AUDIO_OVERVIEW_BRIEF_SYSTEM_PROMPT = `你是中文 AI 播客节目策划，需要把书籍元数据整理成可供双人播客脚本使用的节目 brief。
要求：
1. 只能基于用户给出的书名、作者、真实简介和播客切入点，不要虚构未提供的情节、奖项、销量或作者背景
2. 输出纯 JSON 对象，不要 Markdown，不要额外说明
3. JSON 字段必须包含 episodeQuestion、openingPromise、bookRoles、crossBookAngles、listenerTakeaways、sourceLimits
4. bookRoles 数组中每本书必须出现一次，使用原始 title，并说明它在本期节目中承担什么讨论角色
5. crossBookAngles 至少 2 条；单本书时改为该书内部的 2 个讨论角度
6. openingPromise 要告诉听众听完能获得什么，而不是寒暄或营销话术
7. sourceLimits 必须明确哪些事实不能编造，例如奖项、销量、情节细节、作者背景`;

export const AUDIO_OVERVIEW_BRIEF_USER_TEMPLATE = (
  title: string,
  books: Array<{ title: string; author: string; summary?: string | null; podcastAngle?: string | null }>,
) =>
  `请为播客"${title}"生成节目策划 brief。\n\n参考书目：\n${books
    .map(
      (b, i) =>
        `${i + 1}. ${b.title} - ${b.author}${b.summary ? `\n真实简介：${b.summary.slice(0, 500)}` : ''}${
      b.podcastAngle ? `\n播客切入点：${b.podcastAngle.slice(0, 220)}` : ''
        }`,
    )
    .join('\n\n')}\n\n请输出格式：{"episodeQuestion":"...","openingPromise":"...","bookRoles":[{"title":"...","role":"..."}],"crossBookAngles":["..."],"listenerTakeaways":["..."],"sourceLimits":["..."]}`;

const coverageGuidance = (books: Array<{ title: string }>): string =>
  books.length > 10
    ? `- 本期一共 ${books.length} 本书，属于多书专题。请把书分成 3-5 个主题簇串联，每本书至少用完整书名进入节目主线 1 次，并说明它在主题簇中的角色；不要机械要求每本书重复出现。`
    : `- 本期一共 ${books.length} 本书，脚本必须覆盖所有书目；每本书至少出现 2 次，并且至少有 1 条台词讲它的核心内容或价值。`;

export const SIX_SEGMENT_USER_TEMPLATE = (
  title: string,
  books: Array<{ title: string; author: string; summary?: string | null; podcastAngle?: string | null }>,
  scriptTemplate: ScriptTemplate = 'default',
) =>
  `请基于以下书目创作一期播客脚本：\n\n书名：${title}\n脚本风格：${SCRIPT_TEMPLATE_GUIDANCE[scriptTemplate]}\n参考书目：\n${books
    .map((b, i) => {
      const summary = b.summary ? `（真实简介：${b.summary.slice(0, 280)}）` : '';
      const podcastAngle = b.podcastAngle ? `\n   播客切入点：${b.podcastAngle.slice(0, 160)}` : '';
      return `${i + 1}. ${b.title} - ${b.author}${summary}${podcastAngle}`;
    })
    .join('\n')}\n\n节目策划要求：\n${coverageGuidance(books)}\n- 如果有多本书，不要做流水账书单。请先提出一个总问题，再比较这些书怎样从不同角度回答这个问题。\n- introduce 段：交代每本书的作者、主题和为什么放在同一期，不要只报书单。\n- interpret 段：做真正解读，至少包含 2 个跨书对照点，并让主持人追问"这和另一本书有什么关系"。\n- review 段：给出判断，不只夸赞，也指出局限、争议或时代背景。\n- suggest 段：告诉听众先读哪本、带着什么问题读、适合什么人。\n- closing 段：用 2-3 句话收束所有书的共同意义。\n- 大批量书目时优先做主题分组和代表性对照，控制整体在 10-14 条高信息密度台词内，避免逐本流水账。\n- 书名必须逐字沿用上方参考书目的 title，不能把一个英文词替换成意思相近的另一个词；带副标题或括号的书，首次提及时使用完整书名，后续可以简称。\n- 少用感叹词和附和词；不要连续出现"对/没错/嗯"。\n- 禁止虚构未提供的情节、奖项、销量、作者背景或行业评价；如果简介不足，请用"从已知信息看"这类边界表达。\n\n请严格按六段式输出 JSON 对象：{"segments":[{"speaker":"host","text":"...","emotion":"开心","stage":"intro"}]}。`;

export const MERGE_MODE_SYSTEM_PROMPT = `你是播客脚本作家，需要把多本书融合到一期播客中。
要求：
1. 少量书目时可按书推进；大批量书目时必须按主题簇推进，避免逐本流水账
2. 内容按：总问题 → 主题分组 → 跨书比较 → 阅读建议 → 收束观点组成
3. 整体 2500-4500 字
4. 每条台词必须有 speaker、text、emotion、stage 字段
5. 情绪限定：开心 | 沉思 | 激昂 | 平缓 | 温柔 | 幽默 | 坚定 | 紧张
6. 输出纯 JSON 对象，格式为 {"segments":[...]}
7. 书名必须严格沿用参考书目中的原始 title，不能改写、误译、替换成相似书名；首次提及每本书时使用《完整书名》
`;

export const EMOTION_DISTRIBUTION: Record<ScriptStage, ScriptEmotion[]> = {
  intro: ['开心', '平缓'],
  introduce: ['平缓', '温柔'],
  interpret: ['沉思', '激昂', '坚定'],
  review: ['沉思', '幽默'],
  suggest: ['坚定', '激昂'],
  closing: ['温柔', '平缓'],
};

export const pickEmotion = (stage: ScriptStage, idx: number): ScriptEmotion => {
  const pool = EMOTION_DISTRIBUTION[stage];
  return pool[idx % pool.length];
};

export const pickSpeaker = (idx: number): Speaker => (idx % 2 === 0 ? 'host' : 'guest');
