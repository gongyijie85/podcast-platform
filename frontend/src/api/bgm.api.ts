import { request } from './client';

export const bgmApi = {
  async list(): Promise<Array<{ id: string; name: string; category: string; storageKey: string; durationMs: number }>> {
    return request<Array<{ id: string; name: string; category: string; storageKey: string; durationMs: number }>>({
      method: 'GET',
      url: '/api/bgm/tracks',
    });
  },
  async categories(): Promise<string[]> {
    return request<string[]>({ method: 'GET', url: '/api/bgm/categories' });
  },
};
