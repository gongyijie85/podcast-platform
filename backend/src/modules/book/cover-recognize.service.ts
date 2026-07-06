import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * agnes-2.0-flash 返回的聊天 completions 响应（仅取需要字段）
 */
type AgnesChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

/**
 * 识别结果
 * - title/author 为封面主文字
 * - isbn 优先从封底条码读取，可作为唯一标识快速定位
 * - publisher/publishedYear/language 辅助排序与过滤
 * - confidence 供前端提示用户识别可信度
 */
export interface CoverRecognition {
  title: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  publishedYear?: string;
  language?: string;
  confidence?: 'high' | 'medium' | 'low' | 'unknown';
}

const RECOGNIZE_PROMPT =
  '请识别图书封面图片。尽可能读取封面上的书名、作者、ISBN、出版社、出版年份、语种。' +
  'ISBN 通常在封底条码位置，是 10 或 13 位数字，可能以 978 或 979 开头。' +
  '返回严格 JSON 格式 {"title":"书名","author":"作者","isbn":"ISBN或空","publisher":"出版社或空","publishedYear":"年份或空","language":"语种或空","confidence":"high|medium|low|unknown"}。' +
  '外文书请保留原文不要翻译。无法识别时返回 {"title":"","author":"","isbn":"","publisher":"","publishedYear":"","language":"","confidence":"unknown"}。' +
  '只返回 JSON，不要加任何解释或代码块标记。';

/**
 * CoverRecognizeService
 * 调 agnes-2.0-flash（OpenAI 兼容）识别封面图片，返回书名+作者。
 * 图片以 base64 data URL 直传，不落盘、不传 OSS。
 * 无 LLM_VISION_API_KEY 或调用失败时返回 null，由上层兜底。
 */
@Injectable()
export class CoverRecognizeService {
  private readonly logger = new Logger(CoverRecognizeService.name);
  private readonly http = axios.create({ timeout: 30_000 });

  constructor(private readonly config: ConfigService) {}

  /**
   * 识别封面
   * @param buffer 图片 buffer
   * @param mimetype image/jpeg 或 image/png
   * @returns 识别到的书名+作者；识别失败或未配置返回 null
   */
  async recognize(buffer: Buffer, mimetype: string): Promise<CoverRecognition | null> {
    const apiKey = this.config.get<string>('thirdParty.llmVision.apiKey');
    const endpoint = this.config.get<string>('thirdParty.llmVision.endpoint');
    const model = this.config.get<string>('thirdParty.llmVision.model');

    if (!apiKey || !endpoint || !model) {
      this.logger.warn('LLM_VISION_API_KEY/ENDPOINT/MODEL missing; cover recognition skipped');
      return null;
    }

    const dataUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;

    try {
      const resp = await this.http.post<AgnesChatResponse>(
        `${endpoint}/chat/completions`,
        {
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: RECOGNIZE_PROMPT },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 200,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = resp.data?.choices?.[0]?.message?.content;
      if (!content) {
        this.logger.warn('agnes returned empty content');
        return null;
      }

      return this.parseRecognition(content);
    } catch (e) {
      this.logger.error(`agnes cover recognition failed: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * 解析 agnes 返回的 JSON（兼容 ```json 代码块包裹）
   * 提取书名、作者、ISBN、出版社、出版年份、语种和置信度
   */
  private parseRecognition(content: string): CoverRecognition | null {
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
      if (!title) return null;

      const author = typeof parsed.author === 'string' ? parsed.author.trim() : '';
      const isbn = this.cleanIsbn(parsed.isbn);
      const publisher = typeof parsed.publisher === 'string' ? parsed.publisher.trim() : '';
      const publishedYear = typeof parsed.publishedYear === 'string' ? parsed.publishedYear.trim() : '';
      const language = typeof parsed.language === 'string' ? parsed.language.trim() : '';
      const confidence = this.parseConfidence(parsed.confidence);

      return {
        title,
        author: author || undefined,
        isbn: isbn || undefined,
        publisher: publisher || undefined,
        publishedYear: publishedYear || undefined,
        language: language || undefined,
        confidence,
      };
    } catch {
      this.logger.warn(`agnes returned non-JSON content: ${cleaned.slice(0, 200)}`);
      return null;
    }
  }

  /**
   * 清洗 ISBN：只保留 10 或 13 位数字（兼容末尾 X）
   */
  private cleanIsbn(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const cleaned = value.replace(/[-\s]/g, '').trim().toUpperCase();
    if (/^\d{9}[\dX]$/.test(cleaned) || /^\d{13}$/.test(cleaned)) return cleaned;
    return null;
  }

  /**
   * 解析置信度，只允许枚举值，非法时返回 unknown
   */
  private parseConfidence(value: unknown): CoverRecognition['confidence'] {
    if (value === 'high' || value === 'medium' || value === 'low') return value;
    return 'unknown';
  }
}
