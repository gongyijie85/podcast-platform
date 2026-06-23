import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useAuthStore } from '../store/auth.store';

// Mock the authApi module
vi.mock('../api/auth.api', () => {
  return {
    authApi: {
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      me: vi.fn(),
      refresh: vi.fn(),
      getStoredUser: vi.fn().mockReturnValue(null),
      isLoggedIn: vi.fn().mockReturnValue(false),
      persist: vi.fn(),
    },
  };
});

import { authApi } from '../api/auth.api';
const mocked = vi.mocked(authApi);

const fakeUser = {
  id: 'u-1',
  email: 'test@example.com',
  phone: null,
  nickname: 'Tester',
  avatarUrl: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const fakeTokens = {
  accessToken: 'access-xyz',
  refreshToken: 'refresh-xyz',
  expiresIn: 900,
};

const fakeAuthResponse = { ...fakeUser, tokens: fakeTokens };

describe('useAuthStore', () => {
  beforeEach(() => {
    // reset store between tests
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
      loading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init()', () => {
    it('restores isAuthenticated=true when getStoredUser returns a user', () => {
      mocked.getStoredUser.mockReturnValue(fakeUser);
      mocked.isLoggedIn.mockReturnValue(true);
      useAuthStore.getState().init();
      const s = useAuthStore.getState();
      expect(s.user).toEqual(fakeUser);
      expect(s.isAuthenticated).toBe(true);
      expect(s.token).toBe('present');
    });

    it('leaves state unauthenticated when no stored user', () => {
      mocked.getStoredUser.mockReturnValue(null);
      mocked.isLoggedIn.mockReturnValue(false);
      useAuthStore.getState().init();
      const s = useAuthStore.getState();
      expect(s.user).toBeNull();
      expect(s.isAuthenticated).toBe(false);
      expect(s.token).toBeNull();
    });

    it('clears stale stored user when access token is missing', () => {
      mocked.getStoredUser.mockReturnValue(fakeUser);
      mocked.isLoggedIn.mockReturnValue(false);

      useAuthStore.getState().init();

      const s = useAuthStore.getState();
      expect(s.user).toBeNull();
      expect(s.isAuthenticated).toBe(false);
      expect(s.token).toBeNull();
    });
  });

  describe('login()', () => {
    it('on success: sets user, token, isAuthenticated=true, loading=false, error=null', async () => {
      mocked.login.mockResolvedValue(fakeAuthResponse);
      await act();
      await useAuthStore.getState().login('test@example.com', 'passw0rd!');

      const s = useAuthStore.getState();
      expect(s.user).toMatchObject({ email: 'test@example.com', nickname: 'Tester' });
      expect(s.token).toBe(fakeTokens.accessToken);
      expect(s.isAuthenticated).toBe(true);
      expect(s.error).toBeNull();
      expect(s.loading).toBe(false);
    });

    it('on error: sets error message, keeps isAuthenticated=false, throws', async () => {
      mocked.login.mockRejectedValue(new Error('Invalid email or password'));
      await expect(
        useAuthStore.getState().login('bad@x.com', 'wrong'),
      ).rejects.toThrow('Invalid email or password');

      const s = useAuthStore.getState();
      expect(s.error).toBe('Invalid email or password');
      expect(s.isAuthenticated).toBe(false);
      expect(s.loading).toBe(false);
    });

    it('on error: falls back to "登录失败" when error is not an Error instance', async () => {
      mocked.login.mockRejectedValue('oops');
      await expect(
        useAuthStore.getState().login('a@b.com', 'c'),
      ).rejects.toBeTruthy();
      expect(useAuthStore.getState().error).toBe('登录失败');
    });
  });

  describe('register()', () => {
    it('on success: sets user and tokens', async () => {
      mocked.register.mockResolvedValue(fakeAuthResponse);
      await useAuthStore.getState().register('a@b.com', 'pass', 'Nick');
      const s = useAuthStore.getState();
      expect(s.user).toMatchObject({ nickname: 'Tester' });
      expect(s.token).toBe(fakeTokens.accessToken);
      expect(s.isAuthenticated).toBe(true);
    });

    it('on error: sets error message and rethrows', async () => {
      mocked.register.mockRejectedValue(new Error('Email already registered'));
      await expect(
        useAuthStore.getState().register('dup@x.com', 'p', 'N'),
      ).rejects.toThrow('Email already registered');
      expect(useAuthStore.getState().error).toBe('Email already registered');
    });
  });

  describe('logout()', () => {
    it('clears user, token, isAuthenticated, error', async () => {
      useAuthStore.setState({
        user: fakeUser,
        token: 'access-xyz',
        isAuthenticated: true,
        error: 'old',
      });
      await useAuthStore.getState().logout();
      const s = useAuthStore.getState();
      expect(s.user).toBeNull();
      expect(s.token).toBeNull();
      expect(s.isAuthenticated).toBe(false);
      expect(s.error).toBeNull();
    });
  });

  describe('clearError()', () => {
    it('clears the error field', () => {
      useAuthStore.setState({ error: 'something bad' });
      useAuthStore.getState().clearError();
      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe('setUser()', () => {
    it('updates user and isAuthenticated when a token is present', () => {
      mocked.isLoggedIn.mockReturnValue(true);
      useAuthStore.getState().setUser(fakeUser);
      expect(useAuthStore.getState().user).toEqual(fakeUser);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('passing null clears user and sets isAuthenticated=false', () => {
      useAuthStore.setState({ user: fakeUser, isAuthenticated: true });
      useAuthStore.getState().setUser(null);
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });
});

// helper: wrap in act() to silence React act warnings
async function act(): Promise<void> {
  // Empty helper - actual await is enough to let microtasks resolve
  await Promise.resolve();
}
