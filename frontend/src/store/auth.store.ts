import { create } from 'zustand';
import { authApi } from '../api/auth.api';
import { localStorageAdapter } from '../storage/local-storage.adapter';
import type { UserDto } from '@shared/user';

interface AuthState {
  token: string | null;
  user: UserDto | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  init: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: UserDto | null) => void;
  clearError: () => void;
}

const extractUser = (r: { id: string; email: string; phone?: string | null; nickname: string; avatarUrl?: string | null; createdAt: string; updatedAt: string }): UserDto => ({
  id: r.id,
  email: r.email,
  phone: r.phone ?? null,
  nickname: r.nickname,
  avatarUrl: r.avatarUrl ?? null,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,
  init: () => {
    const u = authApi.getStoredUser();
    const logged = authApi.isLoggedIn();
    set({ user: u, isAuthenticated: logged, token: logged ? 'present' : null });
  },
  setUser: (u) => set({ user: u, isAuthenticated: !!u }),
  clearError: () => set({ error: null }),
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const r = await authApi.login({ email, password });
      set({
        user: extractUser(r),
        token: r.tokens.accessToken,
        isAuthenticated: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '登录失败';
      set({ error: msg });
      // Clean up any partial state
      localStorageAdapter.remove('auth.accessToken');
      localStorageAdapter.remove('auth.refreshToken');
      throw e;
    } finally {
      set({ loading: false });
    }
  },
  register: async (email, password, nickname) => {
    set({ loading: true, error: null });
    try {
      const r = await authApi.register({ email, password, nickname });
      set({
        user: extractUser(r),
        token: r.tokens.accessToken,
        isAuthenticated: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '注册失败';
      set({ error: msg });
      throw e;
    } finally {
      set({ loading: false });
    }
  },
  logout: async () => {
    await authApi.logout();
    set({ user: null, token: null, isAuthenticated: false, error: null });
  },
}));
