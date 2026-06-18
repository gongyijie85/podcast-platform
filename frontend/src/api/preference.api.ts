import { request } from './client';
import type { UserPreferencesDto } from '@shared/user';

export const preferenceApi = {
  async get(): Promise<UserPreferencesDto> {
    return request<UserPreferencesDto>({ method: 'GET', url: '/users/me/preferences' });
  },
  async patch(payload: UserPreferencesDto): Promise<UserPreferencesDto> {
    return request<UserPreferencesDto>({ method: 'PATCH', url: '/users/me/preferences', data: payload });
  },
};

