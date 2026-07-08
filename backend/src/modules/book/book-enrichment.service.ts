import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BookLibraryService } from './book-library.service';
import type { BookEnrichment, BookEnrichmentSourceRef, BookLibraryItem } from '@shared/book';

type ChatMessage = { role: 'system' | 'user'; content: string };

const SYSTEM_PROMPT = `你是图书直播带货资料编辑。请把图书资料整理成严格 JSON：
{"sellingPoints":["..."],"audience":["..."],"talkingAngles":["..."],"livePitch":"..."}
要求：全中文；不要编造不存在的评分、评论或价格；卖点、适合人群、讲述角度各 2-4 条；livePitch 150-250 字，适合主播直接朗读。只输出 JSON。`;

@Injectable()
export class BookEnrichmentService {
  private readonly logger = new Logger(BookEnrichmentService.name);
  private readonly http = axios.create({ timeout: 60_000 });

  constructor(
    private readonly config: ConfigService,
    private readonly library: BookLibraryService,
  ) {}

  async get(isbn: string): Promise<BookEnrichment | null> {
    const book = await this.library.findByIsbn(isbn);
    if (!book) throw new NotFoundException(`图书不存在：${isbn}`);
    return book.enrichment ?? null;
  }

  async saveManual(isbn: string, patch: BookEnrichment): Promise<BookLibraryItem> {
    const book = await this.mustFind(isbn);
    const now = new Date().toISOString();
    return this.library.updateEnrichment(book.isbn, this.merge(book.enrichment, this.withManualSource(patch, now)));
  }

  async generate(isbn: string): Promise<BookLibraryItem> {
    const book = await this.mustFind(isbn);
    const base = this.merge(book.enrichment, this.googleBooksEnrichment(book));
    const hostBriefZh = await this.generateHostBrief(book, base);
    return this.library.updateEnrichment(book.isbn, {
      ...base,
      hostBriefZh,
    });
  }

  private async mustFind(isbn: string): Promise<BookLibraryItem> {
    const book = await this.library.findByIsbn(isbn);
    if (!book) throw new NotFoundException(`图书不存在：${isbn}`);
    return book;
  }

  private withManualSource(input: BookEnrichment, fetchedAt: string): BookEnrichment {
    const sources = [...(input.sources ?? []), { source: 'manual' as const, fetchedAt }];
    return { ...input, sources: this.dedupeSources(sources) };
  }

  private googleBooksEnrichment(book: BookLibraryItem): BookEnrichment {
    const existing = book.enrichment ?? {};
    const fetchedAt = new Date().toISOString();
    const sources: BookEnrichmentSourceRef[] = [
      ...(existing.sources ?? []),
      { source: book.source, fetchedAt },
    ];
    return {
      ...existing,
      sources: this.dedupeSources(sources),
    };
  }

  private merge(existing: BookEnrichment | null | undefined, incoming: BookEnrichment): BookEnrichment {
    return {
      ...(existing ?? {}),
      ...incoming,
      ratings: incoming.ratings ?? existing?.ratings,
      productDetails: { ...(existing?.productDetails ?? {}), ...(incoming.productDetails ?? {}) },
      reviewInsights: incoming.reviewInsights ?? existing?.reviewInsights,
      relatedBooks: incoming.relatedBooks ?? existing?.relatedBooks,
      hostBriefZh: incoming.hostBriefZh ?? existing?.hostBriefZh,
      sources: this.dedupeSources([...(existing?.sources ?? []), ...(incoming.sources ?? [])]),
      manualNotes: incoming.manualNotes ?? existing?.manualNotes,
    };
  }

  private async generateHostBrief(book: BookLibraryItem, enrichment: BookEnrichment): Promise<NonNullable<BookEnrichment['hostBriefZh']>> {
    const apiKey = this.config.get<string>('thirdParty.llm.apiKey');
    const endpoint = this.config.get<string>('thirdParty.llm.endpoint');
    const model = this.config.get<string>('thirdParty.llm.model');
    if (!apiKey || !endpoint || !model) return this.mockHostBrief(book, enrichment);

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify({ book, enrichment }) },
    ];

    try {
      const resp = await this.http.post(
        `${endpoint}/chat/completions`,
        { model, messages, temperature: 0.4, stream: false, max_completion_tokens: 700 },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
      );
      const content = (resp.data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
      return this.parseHostBrief(content) ?? this.mockHostBrief(book, enrichment);
    } catch (e) {
      this.logger.warn(`Book enrichment LLM failed: ${(e as Error).message}`);
      return this.mockHostBrief(book, enrichment);
    }
  }

  private parseHostBrief(content: string | undefined): NonNullable<BookEnrichment['hostBriefZh']> | null {
    if (!content) return null;
    const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned) as NonNullable<BookEnrichment['hostBriefZh']>;
      return {
        sellingPoints: this.stringList(parsed.sellingPoints),
        audience: this.stringList(parsed.audience),
        talkingAngles: this.stringList(parsed.talkingAngles),
        livePitch: typeof parsed.livePitch === 'string' ? parsed.livePitch.trim() : null,
      };
    } catch {
      return null;
    }
  }

  private mockHostBrief(book: BookLibraryItem, enrichment: BookEnrichment): NonNullable<BookEnrichment['hostBriefZh']> {
    const title = book.titleZh || book.title;
    const summary = (book.summaryZh || book.summary || '').replace(/\s+/g, ' ').trim();
    const rating = enrichment.ratings?.[0];
    const ratingText = rating ? `${rating.label}${rating.score}分` : '读者反馈稳定';
    return {
      sellingPoints: [ratingText, summary ? summary.slice(0, 80) : '适合作为直播间导读书'],
      audience: ['想快速了解这本书是否适合自己的人', '正在给孩子或朋友选书的人'],
      talkingAngles: ['从读者共鸣切入', '从适读场景切入'],
      livePitch: `今天推荐《${title}》。这本书${ratingText}，内容适合在直播间用轻松方式展开。${summary.slice(0, 90)}想找一本好读、有话题、送人也不突兀的书，可以先把它加进购物车。`,
    };
  }

  private stringList(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
      : [];
  }

  private dedupeSources(sources: BookEnrichmentSourceRef[]): BookEnrichmentSourceRef[] {
    const seen = new Set<string>();
    return sources.filter((item) => {
      const key = `${item.source}:${item.url ?? ''}:${item.note ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
