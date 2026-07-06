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
 * 识别结果（书名+作者）
 */
export interface CoverRecognition {
  title: string;
  author?: string;
}

const RECOGNIZE_PROMPT =
  '请识别图书封面上的书名和作者，返回严格 JSON 格式 {"title": "书名", "author": "作者"}。' +
  '外文书请保留原文不要翻译。无法识别时返回 {"title": "", "author": ""}。' +
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
   */
  private parseRecognition(content: string): CoverRecognition | null {
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as { title?: unknown; author?: unknown };
      const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
      const author = typeof parsed.author === 'string' ? parsed.author.trim() : '';
      if (!title) return null;
      return { title, author: author || undefined };
    } catch {
      this.logger.warn(`agnes returned non-JSON content: ${cleaned.slice(0, 200)}`);
      return null;
    }
  }
}
