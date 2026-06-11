import { create } from 'zustand';
import { authApi } from '../api/auth.api';
import type { UserDto } from '@shared/user';

interface UserState {
  user: UserDto | null;
  loggedIn: boolean;
  loading: boolean;
  init: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: UserDto | null) => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  loggedIn: false,
  loading: false,
  init: () => {
    const u = authApi.getStoredUser();
    const logged = authApi.isLoggedIn();
    set({ user: u, loggedIn: logged });
  },
  setUser: (u) => set({ user: u, loggedIn: !!u }),
  login: async (email, password) => {
    set({ loading: true });
    try {
      const r = await authApi.login({ email, password });
      set({ user: r, loggedIn: true });
    } finally {
      set({ loading: false });
    }
  },
  register: async (email, password, nickname) => {
    set({ loading: true });
    try {
      const r = await authApi.register({ email, password, nickname });
      set({ user: r, loggedIn: true });
    } finally {
      set({ loading: false });
    }
  },
  logout: async () => {
    await authApi.logout();
    set({ user: null, loggedIn: false });
  },
}));
