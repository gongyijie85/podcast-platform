/**
 * CoverRecognizeService 单元测试
 * - 顶层 jest.mock 拦截 axios，不真实发 HTTP 请求
 */
const postMock = jest.fn();
jest.mock('axios', () => ({
  create: () => ({ post: postMock }),
}));

import { CoverRecognizeService } from '../src/modules/book/cover-recognize.service';

describe('CoverRecognizeService', () => {
  const config = { get: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildService(): CoverRecognizeService {
    return new CoverRecognizeService(config as never);
  }

  it('returns null when LLM_VISION_API_KEY missing', async () => {
    config.get.mockReturnValue(undefined);
    const svc = buildService();
    const result = await svc.recognize(Buffer.from('fake'), 'image/jpeg');
    expect(result).toBeNull();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('parses plain JSON response from agnes', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'thirdParty.llmVision.apiKey') return 'k';
      if (key === 'thirdParty.llmVision.endpoint') return 'https://agnes.test/v1';
      if (key === 'thirdParty.llmVision.model') return 'agnes-2.0-flash';
      return undefined;
    });
    postMock.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: '{"title": "The Pragmatic Programmer", "author": "Andrew Hunt"}',
            },
          },
        ],
      },
    });
    const svc = buildService();
    const result = await svc.recognize(Buffer.from('fake'), 'image/jpeg');
    expect(result).toEqual({ title: 'The Pragmatic Programmer', author: 'Andrew Hunt' });
    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, body] = postMock.mock.calls[0];
    expect(url).toContain('/chat/completions');
    // 验证图片以 base64 data URL 直传
    const content = body.messages[0].content as Array<{ type: string; image_url?: { url: string } }>;
    const imagePart = content.find((c) => c.type === 'image_url');
    expect(imagePart?.image_url?.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('parses ```json wrapped response', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'thirdParty.llmVision.apiKey') return 'k';
      if (key === 'thirdParty.llmVision.endpoint') return 'https://agnes.test/v1';
      if (key === 'thirdParty.llmVision.model') return 'agnes-2.0-flash';
      return undefined;
    });
    postMock.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: '```json\n{"title": "Clean Code", "author": "Robert C. Martin"}\n```',
            },
          },
        ],
      },
    });
    const svc = buildService();
    const result = await svc.recognize(Buffer.from('fake'), 'image/png');
    expect(result).toEqual({ title: 'Clean Code', author: 'Robert C. Martin' });
  });

  it('returns null when title is empty', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'thirdParty.llmVision.apiKey') return 'k';
      if (key === 'thirdParty.llmVision.endpoint') return 'https://agnes.test/v1';
      if (key === 'thirdParty.llmVision.model') return 'agnes-2.0-flash';
      return undefined;
    });
    postMock.mockResolvedValue({
      data: { choices: [{ message: { content: '{"title": "", "author": ""}' } }] },
    });
    const svc = buildService();
    const result = await svc.recognize(Buffer.from('fake'), 'image/jpeg');
    expect(result).toBeNull();
  });

  it('returns null when agnes call throws', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'thirdParty.llmVision.apiKey') return 'k';
      if (key === 'thirdParty.llmVision.endpoint') return 'https://agnes.test/v1';
      if (key === 'thirdParty.llmVision.model') return 'agnes-2.0-flash';
      return undefined;
    });
    postMock.mockRejectedValue(new Error('network error'));
    const svc = buildService();
    const result = await svc.recognize(Buffer.from('fake'), 'image/jpeg');
    expect(result).toBeNull();
  });
});
