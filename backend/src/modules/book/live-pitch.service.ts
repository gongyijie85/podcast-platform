import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BookLibraryService } from './book-library.service';
import { LIVE_PITCH_SYSTEM_PROMPT, LIVE_PITCH_USER_TEMPLATE } from './prompts/live-pitch.template';
import type { BookLibraryItem, GenerateLivePitchResult } from '@shared/book';

type ChatMessage = { role: 'system' | 'user'; content: string };

/**
 * LivePitchService
 * 为主播口播稿生成服务：基于图书元数据，调 LLM 生成 100-200 字直播话术。
 * 无 LLM_API_KEY 时走 mock 兜底，保证 dev 环境可用。
 */
@Injectable()
export class LivePitchService {
  private readonly logger = new Logger(LivePitchService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly library: BookLibraryService,
  ) {}

  async generate(isbn: string): Promise<GenerateLivePitchResult> {
    const book = await this.library.findByIsbn(isbn);
    if (!book) {
      throw new NotFoundException(`图书不存在：${isbn}`);
    }

    const apiKey = this.config.get<string>('thirdParty.llm.apiKey');
    if (!apiKey) {
      this.logger.warn('LLM_API_KEY missing; live pitch mock mode');
      const pitch = this.mockGenerate(book);
      await this.library.updateLivePitch(isbn, pitch);
      return { isbn, livePitch: pitch, generatedAt: new Date().toISOString() };
    }

    try {
      const pitch = await this.callLlm(book, apiKey);
      await this.library.updateLivePitch(isbn, pitch);
      return { isbn, livePitch: pitch, generatedAt: new Date().toISOString() };
    } catch (e) {
      this.logger.error(`LLM pitch generation failed, falling back to mock: ${(e as Error).message}`);
      const pitch = this.mockGenerate(book);
      await this.library.updateLivePitch(isbn, pitch);
      return { isbn, livePitch: pitch, generatedAt: new Date().toISOString() };
    }
  }

  private async callLlm(book: BookLibraryItem, apiKey: string): Promise<string> {
    const endpoint = this.config.get<string>('thirdParty.llm.endpoint')!;
    const model = this.config.get<string>('thirdParty.llm.model')!;
    const messages: ChatMessage[] = [
      { role: 'system', content: LIVE_PITCH_SYSTEM_PROMPT },
      { role: 'user', content: LIVE_PITCH_USER_TEMPLATE(book) },
    ];

    const resp = await axios.post(
      `${endpoint}/chat/completions`,
      {
        model,
        messages,
        temperature: 0.6,
        stream: false,
        max_completion_tokens: 512,
        top_p: 0.9,
        thinking: { type: 'disabled' },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      },
    );

    const content = (resp.data as { choices?: Array<{ message?: { content?: string } }> })
      .choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty LLM response for live pitch');
    return content.trim();
  }

  /**
   * mock 兜底：基于元数据生成模板化口播稿
   * 优先使用中文翻译字段，避免中英混杂。
   */
  private mockGenerate(book: BookLibraryItem): string {
    const title = book.titleZh?.trim() || book.title;
    const author = book.authorZh?.trim() || book.author;
    if (book.enrichment?.hostBriefZh?.livePitch?.trim()) {
      return book.enrichment.hostBriefZh.livePitch.trim();
    }
    const summary = (book.summaryZh ?? book.summary ?? '').replace(/\s+/g, ' ').trim();
    const trimmedSummary = summary.length > 60 ? `${summary.slice(0, 60)}……` : summary || '一本值得阅读的好书';
    const focus = author && author !== 'Unknown' ? `${author}的力作` : '这部作品';
    return `今天给大家推荐《${title}》，${focus}。${trimmedSummary}适合喜欢深度阅读的朋友，无论通勤还是睡前都能轻松翻开。直播间限时优惠，点击购物车带回家。`;
  }
}
