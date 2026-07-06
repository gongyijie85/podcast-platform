import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface BookTranslation {
  titleZh?: string;
  authorZh?: string;
  publisherZh?: string;
  summaryZh?: string;
}

interface TranslationInput {
  title: string;
  author?: string | null;
  publisher?: string | null;
  summary?: string | null;
}

const TRANSLATE_PROMPT =
  '请将下面的图书信息翻译成自然流畅的中文。' +
  '书名保留原意并给出常用中文译名（如已有公认译名请优先使用），作者和出版社名按中文习惯音译或保留原名。' +
  '简介要通顺、完整，适合中国读者理解。' +
  '返回严格 JSON 格式 {"titleZh":"...","authorZh":"...","publisherZh":"...","summaryZh":"..."}。' +
  '只返回 JSON，不要加任何解释或代码块标记。';

/**
 * TranslationService
 * 调用 OpenAI 兼容 LLM 把外文图书元数据翻译成中文。
 * 复用 thirdParty.llm 配置；未配置时返回空翻译，不阻塞主流程。
 */
@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private readonly http = axios.create({ timeout: 120_000 });

  constructor(private readonly config: ConfigService) {}

  /**
   * 判断是否需要翻译：原文以中文为主时跳过
   */
  shouldTranslate(language?: string | null, text?: string | null): boolean {
    if (language && /^zh/i.test(language)) return false;
    if (!text) return false;
    // 简单启发：如果已有超过 30% 的汉字，视为中文内容
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
    return chineseChars / text.length < 0.3;
  }

  /**
   * 翻译图书元数据
   * @returns 中文翻译字段；未配置或失败时返回空对象
   */
  async translateBook(input: TranslationInput): Promise<BookTranslation> {
    const apiKey = this.config.get<string>('thirdParty.llm.apiKey');
    const endpoint = this.config.get<string>('thirdParty.llm.endpoint');
    const model = this.config.get<string>('thirdParty.llm.model');

    if (!apiKey || !endpoint || !model) {
      this.logger.debug('LLM_API_KEY/ENDPOINT/MODEL missing; book translation skipped');
      return {};
    }

    const payload = {
      title: input.title,
      author: input.author || '',
      publisher: input.publisher || '',
      summary: input.summary || '',
    };

    try {
      const resp = await this.http.post(
        `${endpoint}/chat/completions`,
        {
          model,
          messages: [
            { role: 'system', content: TRANSLATE_PROMPT },
            { role: 'user', content: JSON.stringify(payload) },
          ],
          temperature: 0.3,
              max_tokens: 4096,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = (resp.data as { choices?: Array<{ message?: { content?: string } }> })
        ?.choices?.[0]?.message?.content;
      if (!content) return {};

      return this.parseTranslation(content);
    } catch (e) {
      this.logger.warn(`Book translation failed: ${(e as Error).message}`);
      return {};
    }
  }

  private parseTranslation(content: string): BookTranslation {
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      const result: BookTranslation = {};
      if (typeof parsed.titleZh === 'string' && parsed.titleZh.trim()) {
        result.titleZh = parsed.titleZh.trim();
      }
      if (typeof parsed.authorZh === 'string' && parsed.authorZh.trim()) {
        result.authorZh = parsed.authorZh.trim();
      }
      if (typeof parsed.publisherZh === 'string' && parsed.publisherZh.trim()) {
        result.publisherZh = parsed.publisherZh.trim();
      }
      if (typeof parsed.summaryZh === 'string' && parsed.summaryZh.trim()) {
        result.summaryZh = parsed.summaryZh.trim();
      }
      return result;
    } catch {
      this.logger.warn(`LLM returned non-JSON translation: ${cleaned.slice(0, 200)}`);
      return {};
    }
  }
}
