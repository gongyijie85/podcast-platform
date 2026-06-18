import { request } from './client';
import type { BgmTrackDto, BgmCategory } from '@shared/book';

export const bgmApi = {
  async list(): Promise<BgmTrackDto[]> {
    return request<BgmTrackDto[]>({
      method: 'GET',
      url: '/bgm/tracks',
    });
  },
  async categories(): Promise<BgmCategory[]> {
    return request<BgmCategory[]>({ method: 'GET', url: '/bgm/categories' });
  },
};
