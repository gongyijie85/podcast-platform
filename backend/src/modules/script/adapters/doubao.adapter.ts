import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { nanoid } from 'nanoid';
import type { LlmAdapter, ScriptGenerationContext } from './llm.adapter';
import type { ScriptSegmentDto, ScriptEmotion, ScriptStage, Speaker } from '@shared/script';
import {
  SIX_SEGMENT_SYSTEM_PROMPT,
  SIX_SEGMENT_USER_TEMPLATE,
  pickEmotion,
  pickSpeaker,
  EMOTION_POOL,
  SIX_SEGMENT_STAGES,
} from '../prompts/six-segment.template';
import { MERGE_MODE_SYSTEM_PROMPT, MERGE_MODE_USER_TEMPLATE } from '../prompts/merge-mode.template';

/**
 * DoubaoAdapter
 * - Calls Volcengine ARK Doubao API when DOUBAO_API_KEY is set
 * - Falls back to deterministic mock data otherwise (default for local dev)
 */
@Injectable()
export class DoubaoAdapter implements LlmAdapter {
  readonly name = 'doubao';
  private readonly logger = new Logger(DoubaoAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async generateScript(ctx: ScriptGenerationContext): Promise<ScriptSegmentDto[]> {
    const apiKey = this.config.get<string>('thirdParty.doubao.apiKey');
    if (!apiKey) {
      this.logger.warn('DOUBAO_API_KEY missing → mock mode (Mock 模式 - 实际部署需配置 API Key)');
      return this.mock(ctx);
    }
    try {
      return await this.callReal(ctx, apiKey);
    } catch (e) {
      this.logger.error(`Doubao API failed, falling back to mock: ${(e as Error).message}`);
      return this.mock(ctx);
    }
  }

  private async callReal(ctx: ScriptGenerationContext, apiKey: string): Promise<ScriptSegmentDto[]> {
    const endpoint = this.config.get<string>('thirdParty.doubao.endpoint')!;
    const model = this.config.get<string>('thirdParty.doubao.model')!;
    const system =
      ctx.template === 'merge' || ctx.mode === 'merged'
        ? MERGE_MODE_SYSTEM_PROMPT
        : SIX_SEGMENT_SYSTEM_PROMPT;
    const user =
      ctx.template === 'merge' || ctx.mode === 'merged'
        ? MERGE_MODE_USER_TEMPLATE(ctx.title, ctx.books)
        : SIX_SEGMENT_USER_TEMPLATE(ctx.title, ctx.books);

    const resp = await axios.post(
      `${endpoint}/chat/completions`,
      {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60_000,
      },
    );

    const content = (resp.data as { choices?: Array<{ message?: { content?: string } }> })
      .choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty LLM response');
    const parsed = JSON.parse(content) as { segments?: ScriptSegmentDto[] } | ScriptSegmentDto[];
    const list = Array.isArray(parsed) ? parsed : parsed.segments ?? [];
    return list.map((s, i) => this.normalize(s, i));
  }

  private mock(ctx: ScriptGenerationContext): ScriptSegmentDto[] {
    const segments: ScriptSegmentDto[] = [];
    const stages: ScriptStage[] =
      ctx.mode === 'merged'
        ? Array.from({ length: ctx.books.length }).flatMap(() => [
            'introduce' as ScriptStage,
            'interpret' as ScriptStage,
            'review' as ScriptStage,
            'suggest' as ScriptStage,
          ])
        : [...SIX_SEGMENT_STAGES];

    const sampleLines: Record<ScriptStage, string[]> = {
      intro: [
        '大家好，欢迎来到本期 AI 播客，我是主持人小播。',
        '今天我们请到了一位重量级嘉宾，一起来聊一本值得反复翻阅的好书。',
        '在节目开始前呢，请大家动动手指点个关注，那我们就开始啦。',
      ],
      introduce: [
        '这本《${book}》的作者是 ${author}，是一本 ${tag} 类型的书。',
        '它首次出版于 ${year} 年，到今天已经重印了无数次。',
        '那这本书主要讲的是 ${summary}',
      ],
      interpret: [
        '我印象最深的是作者对" ${topic} "这个概念的拆解。',
        '他不是简单的二分法，而是给了我们三层递进的关系。',
        '这跟过去我们习惯的"非黑即白"非常不同。',
        '更妙的是，作者举了一个让人会心一笑的例子。',
      ],
      review: [
        '坦白讲，这本书的某些观点我也并不完全同意。',
        '但作者的论证过程，确实让我看到了不一样的一面。',
        '比起结论本身，我更欣赏他思考问题的方式。',
      ],
      suggest: [
        '如果你也是第一次读，我建议先翻第三章。',
        '通勤路上听其实效果也不错，每次 20 分钟，几天就能读完。',
        '欢迎在评论区告诉我你最想讨论的章节。',
      ],
      closing: [
        '好啦，今天的节目就到这里，谢谢嘉宾，也谢谢每一位听众。',
        '我们下期再见，记得点个关注哦。',
        '晚安，做个好梦。',
      ],
    };

    const placeholders = (stage: ScriptStage, idx: number): string => {
      const book = ctx.books[0]?.title ?? '示例书';
      const author = ctx.books[0]?.author ?? '作者';
      const summary = ctx.books[0]?.summary ?? '一本值得一读的好书';
      const tag = '人文社科';
      const year = '2017';
      const topic = ['时间', '认知', '自由', '协作'][idx % 4];
      return sampleLines[stage]
        .map((l) =>
          l
            .replace('${book}', book)
            .replace('${author}', author)
            .replace('${summary}', summary.slice(0, 30))
            .replace('${tag}', tag)
            .replace('${year}', year)
            .replace('${topic}', topic),
        )
        .join('');
    };

    let order = 0;
    for (const stage of stages) {
      const lines = sampleLines[stage] ?? [];
      for (let i = 0; i < lines.length; i++) {
        segments.push({
          id: nanoid(),
          scriptId: '',
          orderIndex: order++,
          speaker: pickSpeaker(order),
          text: placeholders(stage, i),
          emotion: pickEmotion(stage, i),
          stage,
          startTime: null,
          endTime: null,
        });
      }
    }
    // Ensure 1500-3000 char range (mock content is short, so expand by padding)
    while (segments.length < 24) {
      const last = segments[segments.length - 1];
      segments.push({
        ...last,
        id: nanoid(),
        orderIndex: order++,
        text: `${last.text}（补充讨论）`,
      });
    }
    return segments;
  }

  private normalize(s: ScriptSegmentDto, idx: number): ScriptSegmentDto {
    const speaker: Speaker = s.speaker === 'host' || s.speaker === 'guest' ? s.speaker : pickSpeaker(idx);
    const stage: ScriptStage = (SIX_SEGMENT_STAGES as readonly string[]).includes(s.stage)
      ? (s.stage as ScriptStage)
      : 'interpret';
    const emotion: ScriptEmotion = (EMOTION_POOL as readonly string[]).includes(s.emotion)
      ? (s.emotion as ScriptEmotion)
      : pickEmotion(stage, idx);
    return {
      id: nanoid(),
      scriptId: '',
      orderIndex: idx,
      speaker,
      text: String(s.text ?? '').slice(0, 1000),
      emotion,
      stage,
      startTime: null,
      endTime: null,
    };
  }
}
