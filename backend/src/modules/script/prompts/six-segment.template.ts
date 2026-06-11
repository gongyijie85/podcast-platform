import type { ScriptStage, ScriptEmotion, Speaker } from '@shared/script';

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
5. 必须输出合法 JSON 数组，不要任何额外说明
6. 台词口语化、生活化、避免书面语和长句
7. 主持人 (host) 负责引导话题；嘉宾 (guest) 负责深度解读
`;

export const SIX_SEGMENT_USER_TEMPLATE = (title: string, books: Array<{ title: string; author: string; summary?: string | null }>) =>
  `请基于以下书目创作一期播客脚本：\n\n书名：${title}\n参考书目：\n${books
    .map((b, i) => `${i + 1}. ${b.title} - ${b.author}${b.summary ? `（简介：${b.summary.slice(0, 200)}）` : ''}`)
    .join('\n')}\n\n请严格按六段式输出 JSON 数组。`;

export const MERGE_MODE_SYSTEM_PROMPT = `你是播客脚本作家，需要把多本书融合到一期播客中。
要求：
1. 每本书作为一个"章"，章首有 30-50 字引子，章末有 20-30 字过渡
2. 每章内部按：介绍 → 解读 → 评价 → 建议 四段组成
3. 整体 2500-4500 字
4. 每条台词必须有 speaker、text、emotion、stage 字段
5. 情绪限定：开心 | 沉思 | 激昂 | 平缓 | 温柔 | 幽默 | 坚定 | 紧张
6. 输出纯 JSON 数组
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
