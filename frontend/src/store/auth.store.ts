import { create } from 'zustand';
import { authApi } from '../api/auth.api';
import { projectApi } from '../api/project.api';
import { localStorageAdapter } from '../storage/local-storage.adapter';
import type { UserDto } from '@shared/user';

const GUEST_PROJECT_IDS_KEY = 'guest.projectIds';
const ACCESS_KEY = 'auth.accessToken';
const REFRESH_KEY = 'auth.refreshToken';
const USER_KEY = 'auth.user';

const clearStoredAuth = (): void => {
  localStorageAdapter.remove(ACCESS_KEY);
  localStorageAdapter.remove(REFRESH_KEY);
  localStorageAdapter.remove(USER_KEY);
};

async function syncGuestProjects(): Promise<void> {
  const ids = localStorageAdapter.get<string[]>(GUEST_PROJECT_IDS_KEY) ?? [];
  if (ids.length === 0) return;
  const result = await projectApi.sync(ids);
  if (result.synced > 0) {
    localStorageAdapter.remove(GUEST_PROJECT_IDS_KEY);
  }
}

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
    if (!logged || !u) {
      clearStoredAuth();
      set({ user: null, isAuthenticated: false, token: null });
      return;
    }
    set({ user: u, isAuthenticated: true, token: 'present' });
  },
  setUser: (u) => set({ user: u, isAuthenticated: !!u && authApi.isLoggedIn() }),
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
      await syncGuestProjects().catch(() => undefined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '登录失败';
      set({ error: msg });
      // Clean up any partial state
      clearStoredAuth();
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
      await syncGuestProjects().catch(() => undefined);
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
