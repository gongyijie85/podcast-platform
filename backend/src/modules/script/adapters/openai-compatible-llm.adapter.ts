import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { nanoid } from 'nanoid';
import type { GeneratedScriptResult, LlmAdapter, ScriptGenerationContext } from './llm.adapter';
import type { EpisodeBriefDto, ScriptSegmentDto, ScriptEmotion, ScriptStage, Speaker } from '@shared/script';
import {
  AUDIO_OVERVIEW_BRIEF_SYSTEM_PROMPT,
  AUDIO_OVERVIEW_BRIEF_USER_TEMPLATE,
  SIX_SEGMENT_SYSTEM_PROMPT,
  SIX_SEGMENT_USER_TEMPLATE,
  pickEmotion,
  pickSpeaker,
  EMOTION_POOL,
  SIX_SEGMENT_STAGES,
} from '../prompts/six-segment.template';
import { MERGE_MODE_SYSTEM_PROMPT, MERGE_MODE_USER_TEMPLATE } from '../prompts/merge-mode.template';

type ChatMessage = { role: 'system' | 'user'; content: string };

/**
 * OpenAICompatibleLlmAdapter
 * - Calls Xiaomi MiMo through the Token Plan OpenAI-compatible API when LLM_API_KEY is set
 * - Falls back to deterministic mock data otherwise (default for local dev)
 */
@Injectable()
export class OpenAICompatibleLlmAdapter implements LlmAdapter {
  readonly name = 'mimo';
  private readonly logger = new Logger(OpenAICompatibleLlmAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async generateScript(ctx: ScriptGenerationContext): Promise<GeneratedScriptResult> {
    const apiKey = this.config.get<string>('thirdParty.llm.apiKey');
    if (!apiKey) {
      this.logger.warn('LLM_API_KEY missing; Xiaomi MiMo/Token Plan mock mode');
      return this.mock(ctx);
    }
    try {
      return await this.callReal(ctx, apiKey);
    } catch (e) {
      this.logger.error(`MiMo API failed, falling back to mock: ${(e as Error).message}`);
      return this.mock(ctx);
    }
  }

  private async callReal(ctx: ScriptGenerationContext, apiKey: string): Promise<GeneratedScriptResult> {
    const endpoint = this.config.get<string>('thirdParty.llm.endpoint')!;
    const model = this.config.get<string>('thirdParty.llm.model')!;
    let system =
      ctx.template === 'merge' || ctx.mode === 'merged'
        ? MERGE_MODE_SYSTEM_PROMPT
        : SIX_SEGMENT_SYSTEM_PROMPT;
    let user =
      ctx.template === 'merge' || ctx.mode === 'merged'
        ? MERGE_MODE_USER_TEMPLATE(ctx.title, ctx.books, ctx.scriptTemplate)
        : SIX_SEGMENT_USER_TEMPLATE(ctx.title, ctx.books, ctx.scriptTemplate);
    let episodeBrief: EpisodeBriefDto | null = null;
    if (ctx.scriptTemplate === 'audio-overview') {
      episodeBrief = await this.generateAudioOverviewBrief(endpoint, model, apiKey, ctx);
      system = `${system}

Audio Overview 生成要求：
1. 主持人像节目制作人一样负责提出问题、转换层次、替听众追问
2. 嘉宾负责解释、比较、判断，不要只复述简介
3. 开场 2-3 句要给出本期能获得什么，避免寒暄
4. 每段都要出现"问题推进"，不能只做书目播报
5. 所有判断必须能从给定书籍信息或节目 brief 推出，不能虚构未提供事实
6. 输出前做一次内部自检：书目覆盖、跨书比较、空话密度、事实边界`;
      user = `${user}

节目策划 brief（必须遵循）：
${JSON.stringify(episodeBrief, null, 2)}

请先在内部按 sourceLimits 自检事实边界，再输出最终脚本 JSON。`;
    }
    const revision = this.revisionInstruction(ctx);
    if (revision) {
      user = `${user}

返修导演指令（优先级高于普通风格描述，但不得违反书名和事实边界）：
${revision}`;
    }
    const titleRules = this.titlePreservationInstruction(ctx.books);

    const attempts: Array<{ messages: ChatMessage[]; temperature: number }> = [
      {
        messages: [
          { role: 'system', content: `${system}\n\n${titleRules}` },
          { role: 'user', content: `${user}\n\n${titleRules}` },
        ],
        temperature: 0.4,
      },
      {
        messages: [
          {
            role: 'system',
            content: `${system}

${titleRules}

重要：只允许输出 JSON.stringify 可解析的单个 JSON 对象，格式必须是 {"segments":[...]}。text 中如出现英文双引号必须转义，不要 Markdown，不要注释，不要补充说明。`,
          },
          {
            role: 'user',
            content: `${user}

${titleRules}

请重新生成，并在生成前逐项自检每本书的核心标题是否出现在脚本中，返回压缩的一行合法 JSON 对象：{"segments":[{"speaker":"host","text":"...","emotion":"开心","stage":"intro"}]}`,
          },
        ],
        temperature: 0.1,
      },
    ];

    let lastError: Error | undefined;
    for (const [index, attempt] of attempts.entries()) {
      try {
        const content = await this.requestCompletion(endpoint, model, apiKey, attempt.messages, attempt.temperature);
        const parsed = this.parseModelJson(content);
        const list = this.extractSegments(parsed).filter((segment) => {
          return typeof segment.text === 'string' && segment.text.trim().length > 0;
        });
        if (list.length === 0) {
          throw new Error('LLM response did not contain script segments');
        }
        const normalized = list.map((s, i) => this.normalize(s, i));
        const missingTitles = this.findMissingRequiredBookTitles(ctx, normalized);
        if (missingTitles.length > 0) {
          throw new Error(`LLM script omitted or changed book title(s): ${missingTitles.join(', ')}`);
        }
        return { segments: normalized, episodeBrief };
      } catch (e) {
        lastError = e as Error;
        if (index < attempts.length - 1) {
          this.logger.warn(`MiMo response parse failed, retrying with strict JSON prompt: ${lastError.message}`);
        }
      }
    }

    throw lastError ?? new Error('MiMo API failed');
  }

  private async generateAudioOverviewBrief(
    endpoint: string,
    model: string,
    apiKey: string,
    ctx: ScriptGenerationContext,
  ): Promise<EpisodeBriefDto> {
    const content = await this.requestCompletion(
      endpoint,
      model,
      apiKey,
      [
        { role: 'system', content: AUDIO_OVERVIEW_BRIEF_SYSTEM_PROMPT },
        { role: 'user', content: AUDIO_OVERVIEW_BRIEF_USER_TEMPLATE(ctx.title, ctx.books) },
      ],
      0.2,
    );
    const parsed = this.parseModelJson(content);
    return this.normalizeEpisodeBrief(parsed, ctx);
  }

  private normalizeEpisodeBrief(parsed: unknown, ctx: ScriptGenerationContext): EpisodeBriefDto {
    const data = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const bookRolesRaw = Array.isArray(data.bookRoles) ? data.bookRoles : [];
    const bookRoles = ctx.books.map((book) => {
      const matched = bookRolesRaw.find((item) => {
        return Boolean(item && typeof item === 'object' && (item as Record<string, unknown>).title === book.title);
      }) as Record<string, unknown> | undefined;
      return {
        title: book.title,
        role: typeof matched?.role === 'string' && matched.role.trim()
          ? matched.role.trim()
          : `提供关于"${book.title}"的核心讨论入口。`,
      };
    });

    return {
      episodeQuestion: this.stringOrDefault(data.episodeQuestion, `这些书共同提出了什么值得讨论的问题？`),
      openingPromise: this.stringOrDefault(data.openingPromise, '听众会理解这些书为什么值得放在同一期里讨论。'),
      bookRoles,
      crossBookAngles: this.stringArrayOrDefault(data.crossBookAngles, ctx.books.length > 1
        ? ['比较这些书如何从不同角度回应同一个问题。', '讨论它们在价值判断和现实启发上的差异。']
        : ['讨论这本书的核心问题。', '讨论它对现实生活的启发。']),
      listenerTakeaways: this.stringArrayOrDefault(data.listenerTakeaways, ['带着一个清晰问题继续阅读。']),
      sourceLimits: this.stringArrayOrDefault(data.sourceLimits, ['不要虚构未提供的情节、奖项、销量或作者背景。']),
    };
  }

  private stringOrDefault(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }

  private stringArrayOrDefault(value: unknown, fallback: string[]): string[] {
    if (!Array.isArray(value)) return fallback;
    const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());
    return items.length > 0 ? items : fallback;
  }

  private revisionInstruction(ctx: ScriptGenerationContext): string {
    const presets: Record<string, string> = {
      deeper: '把解释层次加深：少复述简介，多给出判断、因果链和现实含义。',
      'less-filler': '显著减少"嗯、对、没错、好的、哇"等附和词；每句都要推进信息或提出问题。',
      lighter: '让语气更轻松自然，但不要降低信息密度，也不要加入虚构段子。',
      shorter: '压缩到约 8 分钟可听长度：保留核心问题、每本书的关键价值和至少一个跨书比较。',
      'more-cross-book': '加强跨书比较：不要逐本流水账，明确指出这些书在主题、方法或价值判断上的共同点和差异。',
    };
    const parts = [
      ctx.revisionPreset ? presets[ctx.revisionPreset] : '',
      ctx.customInstruction?.trim() ?? '',
    ].filter(Boolean);
    return parts.join('\n');
  }

  private titlePreservationInstruction(books: ScriptGenerationContext['books']): string {
    if (books.length <= 1) {
      return '书名校验：首次提及书籍时使用参考书目的原始 title，不要改写书名。';
    }
    return `书名校验：以下核心书名必须逐项进入脚本，不能改写、误译或替换为相似词：${books
      .map((book, index) => `${index + 1}. ${book.title}`)
      .join('；')}。`;
  }

  private findMissingRequiredBookTitles(
    ctx: ScriptGenerationContext,
    segments: ScriptSegmentDto[],
  ): string[] {
    if (ctx.books.length <= 1) return [];
    const text = this.normalizeTitleText(segments.map((segment) => segment.text).join('\n'));
    return ctx.books
      .filter((book) => !this.bookTitleAppears(book.title, text))
      .map((book) => book.title);
  }

  private bookTitleAppears(title: string, normalizedScriptText: string): boolean {
    return this.bookTitleVariants(title).some((variant) => this.normalizedPhraseAppears(normalizedScriptText, variant));
  }

  private bookTitleVariants(title: string): string[] {
    const withoutParenthetical = title.replace(/\s*[\(（][^)）]*[\)）]\s*/g, ' ').trim();
    const beforeColon = title.split(':')[0]?.trim();
    const beforeDash = title.split(/[—–-]/)[0]?.trim();
    return Array.from(new Set([title, withoutParenthetical, beforeColon, beforeDash].map((item) => this.normalizeTitleText(item))))
      .filter((item) => item.length > 0)
      .sort((a, b) => b.length - a.length);
  }

  private normalizedPhraseAppears(text: string, phrase: string): boolean {
    if (!phrase) return true;
    if (/^[a-z0-9 ]+$/.test(phrase)) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`).test(text);
    }
    return text.includes(phrase);
  }

  private normalizeTitleText(value: string): string {
    return value
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async requestCompletion(
    endpoint: string,
    model: string,
    apiKey: string,
    messages: ChatMessage[],
    temperature: number,
  ): Promise<string> {
    const maxCompletionTokens = this.config.get<number>('thirdParty.llm.maxCompletionTokens') ?? 4096;
    const topP = this.config.get<number>('thirdParty.llm.topP') ?? 0.9;
    const resp = await axios.post(
      `${endpoint}/chat/completions`,
      {
        model,
        messages,
        temperature,
        response_format: { type: 'json_object' },
        stream: false,
        max_completion_tokens: maxCompletionTokens,
        top_p: topP,
        thinking: { type: 'disabled' },
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
    return content;
  }

  private parseModelJson(content: string): unknown {
    const normalized = this.normalizeJsonText(content);
    const candidates = Array.from(
      new Set([content.trim(), normalized, this.extractJsonCandidate(normalized), this.repairCommonJson(normalized)]),
    ).filter(Boolean);
    let lastError: Error | undefined;
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch (e) {
        lastError = e as Error;
      }
    }
    throw new Error(`Invalid LLM JSON: ${lastError?.message ?? 'unknown parse error'}`);
  }

  private normalizeJsonText(content: string): string {
    return content
      .trim()
      .replace(/^\uFEFF/, '')
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .trim();
  }

  private extractJsonCandidate(content: string): string {
    const objectStart = content.indexOf('{');
    const objectEnd = content.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      return content.slice(objectStart, objectEnd + 1);
    }

    const arrayStart = content.indexOf('[');
    const arrayEnd = content.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return content.slice(arrayStart, arrayEnd + 1);
    }

    return content;
  }

  private repairCommonJson(content: string): string {
    return this.extractJsonCandidate(content).replace(/,\s*([}\]])/g, '$1');
  }

  private extractSegments(parsed: unknown): Array<Partial<ScriptSegmentDto> & { section?: string }> {
    if (Array.isArray(parsed)) return parsed as Array<Partial<ScriptSegmentDto>>;
    if (!parsed || typeof parsed !== 'object') return [];

    const data = parsed as {
      segments?: unknown;
      podcast_script?: unknown;
      script?: unknown;
    };

    if (Array.isArray(data.segments)) {
      return this.flattenBlocks(data.segments, 'segment', 'dialogues');
    }
    if (Array.isArray(data.script)) return data.script as Array<Partial<ScriptSegmentDto>>;
    if (Array.isArray(data.podcast_script)) {
      return this.flattenBlocks(data.podcast_script, 'section', 'lines');
    }

    return [];
  }

  private flattenBlocks(
    blocks: unknown[],
    sectionKey: 'section' | 'segment',
    linesKey: 'lines' | 'dialogues',
  ): Array<Partial<ScriptSegmentDto> & { section?: string }> {
    const direct = blocks as Array<Partial<ScriptSegmentDto>>;
    if (direct.some((item) => typeof item.text === 'string')) {
      return direct;
    }

    const flattened: Array<Partial<ScriptSegmentDto> & { section?: string }> = [];
    for (const block of blocks as Array<Record<string, unknown>>) {
      const lines = block[linesKey];
      if (!Array.isArray(lines)) continue;
      const section = typeof block[sectionKey] === 'string' ? block[sectionKey] : undefined;
      for (const line of lines as Array<Partial<ScriptSegmentDto>>) {
        flattened.push({ ...line, section });
      }
    }
    return flattened;
  }

  private mock(ctx: ScriptGenerationContext): GeneratedScriptResult {
    const books = ctx.books.length > 0 ? ctx.books : [{
      isbn: 'mock',
      title: '示例书',
      author: '作者',
      summary: '一本值得一读的好书。',
      source: 'mock' as const,
    }];
    const lines = books.length > 1 ? this.multiBookMockLines(ctx.title, books) : this.singleBookMockLines(books[0]);
    if (ctx.scriptTemplate === 'audio-overview' && lines[0]) {
      lines[0] = {
        ...lines[0],
        text: `${lines[0].text} 我们会先用一个总问题抓住重点，再像资料深潜一样做追问、对照和现实启发。`,
      };
    }
    const segments = lines.map((line, index) => ({
      id: nanoid(),
      scriptId: '',
      orderIndex: index,
      speaker: line.speaker,
      text: line.text,
      emotion: line.emotion,
      stage: line.stage,
      startTime: null,
      endTime: null,
    }));

    while (segments.length < 24) {
      const index = segments.length;
      const stage: ScriptStage = index % 2 === 0 ? 'interpret' : 'review';
      segments.push({
        id: nanoid(),
        scriptId: '',
        orderIndex: index,
        speaker: pickSpeaker(index),
        text: books.length > 1
          ? `补充一个对照角度：${this.bookList(books)}都在讨论选择的代价，只是一个更偏向公共正义，一个更偏向私人欲望。`
          : `补充一个阅读角度：读《${books[0].title}》时，可以把注意力放在作者如何把个人经验推向更大的社会问题。`,
        emotion: pickEmotion(stage, index),
        stage,
        startTime: null,
        endTime: null,
      });
    }

    return {
      segments,
      episodeBrief: ctx.scriptTemplate === 'audio-overview' ? this.mockEpisodeBrief(ctx) : null,
    };
  }

  private mockEpisodeBrief(ctx: ScriptGenerationContext): EpisodeBriefDto {
    const titles = ctx.books.map((book) => book.title).join('、') || ctx.title;
    return {
      episodeQuestion: `这些书如何共同回答"${ctx.title}"这个节目问题？`,
      openingPromise: `用一次双人深潜，帮助听众抓住${titles}之间的关联和差异。`,
      bookRoles: ctx.books.map((book) => ({
        title: book.title,
        role: `${book.author || '作者'}提供一个围绕本期主题的阅读入口。`,
      })),
      crossBookAngles: ctx.books.length > 1
        ? ['比较这些书如何回应同一个核心问题。', '讨论它们在价值判断和现实启发上的差异。']
        : ['讨论这本书的核心问题。', '讨论它对现实生活的启发。'],
      listenerTakeaways: ['带着一个清晰问题继续阅读。', '理解书目之间可以互相照亮的地方。'],
      sourceLimits: ['不要虚构未提供的情节、奖项、销量或作者背景。'],
    };
  }

  private multiBookMockLines(
    title: string,
    books: ScriptGenerationContext['books'],
  ): Array<{ speaker: Speaker; text: string; emotion: ScriptEmotion; stage: ScriptStage }> {
    const labels = this.bookList(books);
    const first = books[0];
    const second = books[1] ?? books[0];
    const lines: Array<{ speaker: Speaker; text: string; emotion: ScriptEmotion; stage: ScriptStage }> = [
      {
        speaker: 'host',
        text: `欢迎来到本期节目。今天我们不做简单书单，而是把${labels}放在同一个问题里：经典作品如何写出一个社会的理想、偏见和幻灭？`,
        emotion: '平缓',
        stage: 'intro',
      },
      {
        speaker: 'guest',
        text: `这个组合很有意思，因为这些书并不是在重复同一个主题。它们分别从家庭、阶层、法律、欲望或时代气氛切入，让听众看到经典为什么会反复被讨论。`,
        emotion: '沉思',
        stage: 'intro',
      },
      {
        speaker: 'host',
        text: `本期标题是《${title}》，我们会先交代每本书的核心，再看它们之间能互相照亮什么。`,
        emotion: '开心',
        stage: 'intro',
      },
    ];

    books.forEach((book, index) => {
      lines.push({
        speaker: index % 2 === 0 ? 'host' : 'guest',
        text: `先看第 ${index + 1} 本，《${book.title}》作者是 ${book.author || '未知作者'}。${this.summarySentence(book)}这给本期讨论提供了一个具体入口。`,
        emotion: '平缓',
        stage: 'introduce',
      });
      lines.push({
        speaker: index % 2 === 0 ? 'guest' : 'host',
        text: `把《${book.title}》放进这期节目，不是因为它有名，而是因为它能回答一个问题：人在时代压力里，怎样理解正义、体面、选择和代价。`,
        emotion: '沉思',
        stage: 'introduce',
      });
    });

    lines.push(
      {
        speaker: 'host',
        text: `第一个对照点是叙事视角。《${first.title}》更像从一个具体人物或家庭的视线进入社会裂缝，而《${second.title}》则把个人命运放在更大的时代欲望里。`,
        emotion: '沉思',
        stage: 'interpret',
      },
      {
        speaker: 'guest',
        text: `这会改变听众的感受：前者让我们先问"什么是公正"，后者让我们追问"什么样的梦想会变成幻觉"。两种问题合在一起，节目就不只是讲情节，而是在讲价值选择。`,
        emotion: '坚定',
        stage: 'interpret',
      },
      {
        speaker: 'host',
        text: `第二个对照点是人物承受压力的方式。有人选择站出来，有人选择追逐或伪装；这些选择背后，都有社会结构推着他们往前走。`,
        emotion: '平缓',
        stage: 'interpret',
      },
      {
        speaker: 'guest',
        text: `所以这期节目最值得聊的不是"哪本更伟大"，而是它们怎样共同提醒我们：一个时代的风光，常常和它遮住的不公、孤独、偏见同时存在。`,
        emotion: '激昂',
        stage: 'interpret',
      },
      {
        speaker: 'host',
        text: `如果听众只记住一个关键词，我希望是"代价"。经典作品之所以耐读，是因为它们不断追问：当社会期待和个人良知冲突时，谁在付出代价？`,
        emotion: '坚定',
        stage: 'interpret',
      },
      {
        speaker: 'guest',
        text: `评价这些书时，要避免只说"伟大"。它们的力量在于把抽象议题落到人物命运里，让读者在故事结束后还会继续判断自己站在哪里。`,
        emotion: '沉思',
        stage: 'review',
      },
      {
        speaker: 'host',
        text: `当然，经典也有时代局限。今天重读时，我们可以欣赏它的文学力量，同时追问它有哪些视角被放大，哪些声音仍然不够充分。`,
        emotion: '平缓',
        stage: 'review',
      },
      {
        speaker: 'guest',
        text: `这恰恰适合播客讨论。两位说话人可以保留分歧：一方谈作品的情感冲击，另一方谈社会结构和历史背景，节目会比单向讲解更有张力。`,
        emotion: '幽默',
        stage: 'review',
      },
      {
        speaker: 'host',
        text: `如果要给阅读顺序，我建议先读更容易进入人物处境的那本，再读时代气氛更复杂的那本。这样听众会先建立情感，再进入判断。`,
        emotion: '温柔',
        stage: 'suggest',
      },
      {
        speaker: 'guest',
        text: `阅读时可以带三个问题：谁拥有解释世界的权力？谁被迫承担沉默的代价？故事里的理想，最后是被证明了，还是被现实击碎了？`,
        emotion: '坚定',
        stage: 'suggest',
      },
      {
        speaker: 'host',
        text: `这几本书适合想重读经典、也想把文学和现实连接起来的听众。它们不是轻松消遣，但很适合做一期有讨论密度的节目。`,
        emotion: '平缓',
        stage: 'suggest',
      },
      {
        speaker: 'guest',
        text: `最后回到本期问题：经典并不只是保存在书架上的荣誉，它会逼我们重新看见社会如何塑造人的选择。`,
        emotion: '沉思',
        stage: 'closing',
      },
      {
        speaker: 'host',
        text: `今天我们用${labels}搭出了一条线：从人物处境，到时代幻象，再到正义和代价。希望你听完之后，不只是知道这些书讲什么，也更想问它们为什么还重要。`,
        emotion: '温柔',
        stage: 'closing',
      },
      {
        speaker: 'guest',
        text: `感谢收听本期节目。下一次打开这些经典时，别急着找标准答案，先看看自己被哪一个选择击中了。`,
        emotion: '平缓',
        stage: 'closing',
      },
    );

    return lines;
  }

  private singleBookMockLines(
    book: ScriptGenerationContext['books'][number],
  ): Array<{ speaker: Speaker; text: string; emotion: ScriptEmotion; stage: ScriptStage }> {
    return [
      { speaker: 'host', text: `欢迎来到本期节目。今天我们聊《${book.title}》，作者是 ${book.author || '未知作者'}。`, emotion: '平缓', stage: 'intro' },
      { speaker: 'guest', text: `这本书值得单独做一期，因为它不只是提供情节或知识，还把一个核心问题推到读者面前。`, emotion: '沉思', stage: 'intro' },
      { speaker: 'host', text: `先用一句话建立入口：${this.summarySentence(book)}`, emotion: '平缓', stage: 'introduce' },
      { speaker: 'guest', text: `真正要听的是它怎样组织冲突，怎样让人物、概念或事件承载更大的时代问题。`, emotion: '坚定', stage: 'introduce' },
      { speaker: 'host', text: `第一个解读点，是作者如何把个人处境和社会结构连接起来。`, emotion: '沉思', stage: 'interpret' },
      { speaker: 'guest', text: `这让《${book.title}》不只是一个故事，而是一种观察世界的方法。`, emotion: '坚定', stage: 'interpret' },
      { speaker: 'host', text: `第二个解读点，是它对选择代价的处理。人物并不是在真空中行动，他们始终被关系、制度和欲望牵引。`, emotion: '平缓', stage: 'interpret' },
      { speaker: 'guest', text: `所以评价这本书，不能只看结论是否正确，还要看它有没有逼读者重新整理自己的判断。`, emotion: '沉思', stage: 'review' },
      { speaker: 'host', text: `它的长处是能把抽象问题落到具体场景里；局限则可能来自时代背景和叙述视角。`, emotion: '平缓', stage: 'review' },
      { speaker: 'guest', text: `第一次读可以先抓住人物关系，再回头看作者如何布置主题。这样比一上来找金句更有效。`, emotion: '温柔', stage: 'suggest' },
      { speaker: 'host', text: `如果你正在寻找一本能引发讨论的书，《${book.title}》适合带着问题慢慢读。`, emotion: '坚定', stage: 'suggest' },
      { speaker: 'guest', text: `本期节目到这里，我们用这本书练习了一件事：把阅读从知道内容，推进到形成判断。`, emotion: '温柔', stage: 'closing' },
    ];
  }

  private bookList(books: ScriptGenerationContext['books']): string {
    return books.map((book) => `《${book.title}》`).join('、');
  }

  private summarySentence(book: ScriptGenerationContext['books'][number]): string {
    const summary = (book.summary ?? '').replace(/\s+/g, ' ').trim();
    return summary ? summary.slice(0, 120) : `它围绕 ${book.title} 的核心主题展开，适合从人物、冲突和时代背景三个层面进入。`;
  }

  private normalize(s: Partial<ScriptSegmentDto> & { section?: string }, idx: number): ScriptSegmentDto {
    const speaker: Speaker = s.speaker === 'host' || s.speaker === 'guest' ? s.speaker : pickSpeaker(idx);
    const stage = this.normalizeStage(s.stage, (s as { section?: string }).section);
    const emotion: ScriptEmotion = s.emotion && (EMOTION_POOL as readonly string[]).includes(s.emotion)
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

  private normalizeStage(stage: unknown, section?: string): ScriptStage {
    if (typeof stage === 'string' && (SIX_SEGMENT_STAGES as readonly string[]).includes(stage)) {
      return stage as ScriptStage;
    }
    const raw = `${section ?? ''} ${typeof stage === 'string' ? stage : ''}`;
    if (/开场|opening|intro/i.test(raw)) return 'intro';
    if (/介绍|背景|书名|作者|introduce/i.test(raw)) return 'introduce';
    if (/解读|核心|观点|interpret/i.test(raw)) return 'interpret';
    if (/评价|评论|review/i.test(raw)) return 'review';
    if (/建议|推荐|行动|suggest/i.test(raw)) return 'suggest';
    if (/收尾|结尾|结束|closing/i.test(raw)) return 'closing';
    return 'interpret';
  }
}
