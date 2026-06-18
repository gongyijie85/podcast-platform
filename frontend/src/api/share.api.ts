import { request } from './client';
import type { SharedProjectDto } from '@shared/project';

export const shareApi = {
  async get(token: string): Promise<SharedProjectDto> {
    return request<SharedProjectDto>({ method: 'GET', url: `/share/${token}` });
  },
};

