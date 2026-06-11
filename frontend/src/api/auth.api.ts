import { request, apiClient } from './client';
import { localStorageAdapter } from '../storage/local-storage.adapter';
import type { AuthResponse, LoginPayload, RegisterPayload, AuthTokens, UserDto } from '@shared/user';

const ACCESS = 'auth.accessToken';
const REFRESH = 'auth.refreshToken';
const USER = 'auth.user';

export const authApi = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const r = await request<AuthResponse>({ method: 'POST', url: '/api/auth/login', data: payload });
    this.persist(r);
    return r;
  },
  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const r = await request<AuthResponse>({ method: 'POST', url: '/api/auth/register', data: payload });
    this.persist(r);
    return r;
  },
  async refresh(): Promise<AuthTokens> {
    const refresh = localStorageAdapter.get<string>(REFRESH);
    if (!refresh) throw new Error('No refresh token');
    const r = await request<AuthTokens>({ method: 'POST', url: '/api/auth/refresh', data: { refreshToken: refresh } });
    localStorageAdapter.set(ACCESS, r.accessToken);
    localStorageAdapter.set(REFRESH, r.refreshToken);
    return r;
  },
  async me(): Promise<UserDto> {
    return request<UserDto>({ method: 'GET', url: '/api/auth/me' });
  },
  async logout(): Promise<void> {
    try {
      await apiClient.post('/api/auth/logout');
    } catch {
      /* ignore */
    }
    localStorageAdapter.remove(ACCESS);
    localStorageAdapter.remove(REFRESH);
    localStorageAdapter.remove(USER);
  },
  persist(r: AuthResponse): void {
    localStorageAdapter.set(ACCESS, r.tokens.accessToken);
    localStorageAdapter.set(REFRESH, r.tokens.refreshToken);
    const { tokens, ...u } = r;
    void tokens;
    localStorageAdapter.set(USER, u);
  },
  getStoredUser(): UserDto | null {
    return localStorageAdapter.get<UserDto>(USER);
  },
  isLoggedIn(): boolean {
    return !!localStorageAdapter.get<string>(ACCESS);
  },
};
