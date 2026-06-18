import { OpenAICompatibleLlmAdapter } from '../src/modules/script/adapters/openai-compatible-llm.adapter';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

jest.mock('axios');

const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>;

const cfg = (apiKey = ''): ConfigService =>
  ({
    get: (k: string) => {
      const map: Record<string, string | number> = {
        'thirdParty.llm.apiKey': apiKey,
        'thirdParty.llm.endpoint': 'https://token-plan-sgp.xiaomimimo.com/v1',
        'thirdParty.llm.model': 'mimo-v2.5-pro',
        'thirdParty.llm.maxCompletionTokens': 4096,
        'thirdParty.llm.topP': 0.9,
      };
      return map[k];
    },
  }) as unknown as ConfigService;

describe('OpenAICompatibleLlmAdapter (MiMo / Token Plan)', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('returns deterministic 6-segment script in mock mode', async () => {
    const a = new OpenAICompatibleLlmAdapter(cfg());
    const { segments: segs } = await a.generateScript({
      projectId: 'p1',
      title: '测试',
      mode: 'independent',
      books: [{ isbn: '9787121362200', title: '人类简史', author: '尤瓦尔', source: 'mock' }],
      template: 'standard',
      scriptTemplate: 'default',
    });
    expect(segs.length).toBeGreaterThanOrEqual(20);
    const stages = new Set(segs.map((s) => s.stage));
    expect(stages.has('intro')).toBe(true);
    expect(stages.has('closing')).toBe(true);
    for (const s of segs) {
      expect(['host', 'guest']).toContain(s.speaker);
      expect(s.text.length).toBeGreaterThan(0);
    }
  });

  it('covers every selected book in multi-book mock mode without empty filler', async () => {
    const a = new OpenAICompatibleLlmAdapter(cfg());
    const { segments: segs } = await a.generateScript({
      projectId: 'p1',
      title: '两本美国经典播客',
      mode: 'merged',
      books: [
        {
          isbn: '9780061120084',
          title: 'To Kill a Mockingbird',
          author: 'Harper Lee',
          summary: 'A story about justice, race, childhood, and moral courage.',
          source: 'openlibrary',
        },
        {
          isbn: '9780743273565',
          title: 'The Great Gatsby',
          author: 'F. Scott Fitzgerald',
          summary: 'A Jazz Age novel about wealth, desire, illusion, and social class.',
          source: 'openlibrary',
        },
      ],
      template: 'merge',
      scriptTemplate: 'default',
    });

    const raw = segs.map((s) => s.text).join('\n');
    expect(raw).toContain('To Kill a Mockingbird');
    expect(raw).toContain('The Great Gatsby');
    expect(raw).toContain('对照');
    expect(raw).not.toContain('没错没错');
    expect(raw).not.toContain('那我们就开始吧');
  });

  it('parses object-shaped model responses with segments', async () => {
    mockedPost.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                segments: [
                  {
                    speaker: 'host',
                    text: '欢迎来到今天的播客。',
                    emotion: '开心',
                    stage: 'intro',
                  },
                ],
              }),
            },
          },
        ],
      },
    });

    const a = new OpenAICompatibleLlmAdapter(cfg('test-key'));
    const { segments: segs } = await a.generateScript({
      projectId: 'p1',
      title: '测试',
      mode: 'independent',
      books: [{ isbn: '9787121362200', title: '人类简史', author: '尤瓦尔', source: 'mock' }],
      template: 'standard',
      scriptTemplate: 'default',
    });

    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('欢迎来到今天的播客。');
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost.mock.calls[0][0]).toBe('https://token-plan-sgp.xiaomimimo.com/v1/chat/completions');
    expect(mockedPost.mock.calls[0][1]).toMatchObject({
      model: 'mimo-v2.5-pro',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      stream: false,
      max_completion_tokens: 4096,
      top_p: 0.9,
      thinking: { type: 'disabled' },
    });
    expect(mockedPost.mock.calls[0][2]).toMatchObject({
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
      },
    });
  });

  it('sends multi-book coverage and filler-word constraints to the real model', async () => {
    mockedPost.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                segments: [
                  {
                    speaker: 'host',
                    text: '今天从《To Kill a Mockingbird》和《The Great Gatsby》共同讨论美国经典里的正义与幻灭。',
                    emotion: '平缓',
                    stage: 'intro',
                  },
                ],
              }),
            },
          },
        ],
      },
    });

    const a = new OpenAICompatibleLlmAdapter(cfg('test-key'));
    await a.generateScript({
      projectId: 'p1',
      title: '两本美国经典播客',
      mode: 'merged',
      books: [
        {
          isbn: '9780061120084',
          title: 'To Kill a Mockingbird',
          author: 'Harper Lee',
          summary: 'A story about justice, race, childhood, and moral courage.',
          source: 'openlibrary',
        },
        {
          isbn: '9780743273565',
          title: 'The Great Gatsby',
          author: 'F. Scott Fitzgerald',
          summary: 'A Jazz Age novel about wealth, desire, illusion, and social class.',
          source: 'openlibrary',
        },
      ],
      template: 'merge',
      scriptTemplate: 'deep-review',
    });

    const body = mockedPost.mock.calls[0][1] as { messages: Array<{ role: string; content: string }> };
    const prompt = body.messages.map((message) => message.content).join('\n');
    expect(prompt).toContain('每本书至少出现 2 次');
    expect(prompt).toContain('跨书比较');
    expect(prompt).toContain('书名校验');
    expect(prompt).toContain('不要用泛泛赞美代替观点');
    expect(prompt).toContain('没错');
  });

  it('generates an audio overview brief before the final MiMo script prompt', async () => {
    mockedPost
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  episodeQuestion: '经典如何处理正义与幻灭？',
                  openingPromise: '听众会快速理解两本书为什么能放在一起。',
                  bookRoles: [
                    { title: 'To Kill a Mockingbird', role: '提供正义和偏见的入口。' },
                    { title: 'The Great Gatsby', role: '提供欲望和幻灭的入口。' },
                  ],
                  crossBookAngles: ['公共正义与私人欲望', '成长视角与时代氛围'],
                  listenerTakeaways: ['带着问题重读经典'],
                  sourceLimits: ['不要虚构未提供的奖项或销量'],
                }),
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  segments: [
                    {
                      speaker: 'host',
                      text: '今天从《To Kill a Mockingbird》和《The Great Gatsby》看经典如何处理正义与幻灭。',
                      emotion: '平缓',
                      stage: 'intro',
                    },
                  ],
                }),
              },
            },
          ],
        },
      });

    const a = new OpenAICompatibleLlmAdapter(cfg('test-key'));
    const result = await a.generateScript({
      projectId: 'p1',
      title: 'AI 深潜播客',
      mode: 'merged',
      books: [
        { isbn: '9780061120084', title: 'To Kill a Mockingbird', author: 'Harper Lee', source: 'openlibrary' },
        { isbn: '9780743273565', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', source: 'openlibrary' },
      ],
      template: 'merge',
      scriptTemplate: 'audio-overview',
    });

    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(result.episodeBrief).toEqual(expect.objectContaining({
      episodeQuestion: '经典如何处理正义与幻灭？',
      openingPromise: '听众会快速理解两本书为什么能放在一起。',
    }));
    expect(result.episodeBrief?.bookRoles).toHaveLength(2);
    const briefBody = mockedPost.mock.calls[0][1] as { messages: Array<{ content: string }> };
    const scriptBody = mockedPost.mock.calls[1][1] as { messages: Array<{ content: string }> };
    expect(briefBody.messages.map((message) => message.content).join('\n')).toContain('节目策划 brief');
    expect(scriptBody.messages.map((message) => message.content).join('\n')).toContain('Audio Overview');
    expect(scriptBody.messages.map((message) => message.content).join('\n')).toContain('经典如何处理正义与幻灭');
    expect(scriptBody.messages.map((message) => message.content).join('\n')).toContain('不要虚构未提供的奖项或销量');
  });

  it('passes quick revision instructions into the final MiMo prompt', async () => {
    mockedPost.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                segments: [
                  {
                    speaker: 'host',
                    text: '今天从《To Kill a Mockingbird》和《The Great Gatsby》继续做跨书比较。',
                    emotion: '平缓',
                    stage: 'intro',
                  },
                ],
              }),
            },
          },
        ],
      },
    });

    const a = new OpenAICompatibleLlmAdapter(cfg('test-key'));
    await a.generateScript({
      projectId: 'p1',
      title: '返修测试',
      mode: 'merged',
      books: [
        { isbn: '9780061120084', title: 'To Kill a Mockingbird', author: 'Harper Lee', source: 'openlibrary' },
        { isbn: '9780743273565', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', source: 'openlibrary' },
      ],
      template: 'merge',
      scriptTemplate: 'default',
      revisionPreset: 'less-filler',
      customInstruction: '加强开场的问题意识。',
    });

    const body = mockedPost.mock.calls[0][1] as { messages: Array<{ role: string; content: string }> };
    const prompt = body.messages.map((message) => message.content).join('\n');
    expect(prompt).toContain('返修导演指令');
    expect(prompt).toContain('显著减少');
    expect(prompt).toContain('加强开场的问题意识');
  });

  it('retries when a multi-book response changes a book title', async () => {
    mockedPost
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  segments: [
                    {
                      speaker: 'host',
                      text: '今天比较《Whistler》和《Our Perfect Summer》如何处理连接与修复。',
                      emotion: '平缓',
                      stage: 'intro',
                    },
                  ],
                }),
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  segments: [
                    {
                      speaker: 'host',
                      text: '今天比较《Whistler》和《Our Perfect Storm》如何处理连接与修复。',
                      emotion: '平缓',
                      stage: 'intro',
                    },
                  ],
                }),
              },
            },
          ],
        },
      });

    const a = new OpenAICompatibleLlmAdapter(cfg('test-key'));
    const { segments: segs } = await a.generateScript({
      projectId: 'p1',
      title: '多书播客',
      mode: 'merged',
      books: [
        { isbn: '9780063511637', title: 'Whistler', author: 'Ann Patchett', source: 'googlebooks' },
        { isbn: '9780593953242', title: 'Our Perfect Storm', author: 'Carley Fortune', source: 'googlebooks' },
      ],
      template: 'merge',
      scriptTemplate: 'default',
    });

    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(segs.map((s) => s.text).join('\n')).toContain('Our Perfect Storm');
    expect(segs.map((s) => s.text).join('\n')).not.toContain('Our Perfect Summer');
  });

  it('retries with a stricter prompt when the first JSON response is malformed', async () => {
    mockedPost
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content:
                  '{"segments":[{"speaker":"host","text":"他说"农业革命"很复杂","emotion":"沉思","stage":"interpret"}]}',
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  segments: [
                    {
                      speaker: 'guest',
                      text: '农业革命带来了新的协作方式，也制造了新的代价。',
                      emotion: '沉思',
                      stage: 'interpret',
                    },
                  ],
                }),
              },
            },
          ],
        },
      });

    const a = new OpenAICompatibleLlmAdapter(cfg('test-key'));
    const { segments: segs } = await a.generateScript({
      projectId: 'p1',
      title: '测试',
      mode: 'independent',
      books: [{ isbn: '9787121362200', title: '人类简史', author: '尤瓦尔', source: 'mock' }],
      template: 'standard',
      scriptTemplate: 'default',
    });

    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(mockedPost.mock.calls[1][1]).toMatchObject({ temperature: 0.1 });
    expect(segs).toHaveLength(1);
    expect(segs[0].speaker).toBe('guest');
    expect(segs[0].text).toContain('农业革命');
  });
});
