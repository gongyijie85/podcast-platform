import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { localStorageAdapter } from '../storage/local-storage.adapter';

// Mock the env module so it doesn't read import.meta.env
vi.mock('../constants/env', () => ({
  ENV: {
    apiBaseUrl: 'http://api.test',
    wsUrl: 'ws://api.test',
    defaultLang: 'zh-CN',
    maxBooks: 20,
  },
}));

// Import AFTER mocking
import { apiClient, request } from '../api/client';

describe('apiClient interceptors', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches Authorization header from localStorage', async () => {
    localStorageAdapter.set('auth.accessToken', 'tok-123');
    const adapter = vi.fn(async (config) => {
      // Simulate response
      return { data: { code: 0, message: 'ok', data: { x: 1 } }, status: 200, config, headers: {} as any };
    });
    apiClient.defaults.adapter = adapter as any;
    const resp = await apiClient.get('/api/me');
    expect(adapter).toHaveBeenCalled();
    const sent = adapter.mock.calls[0][0];
    expect(sent.headers?.Authorization).toBe('Bearer tok-123');
  });

  it('attaches X-Trace-Id header on every request', async () => {
    const adapter = vi.fn(async (config) => ({
      data: { code: 0, message: 'ok', data: null },
      status: 200,
      config,
      headers: {} as any,
    }));
    apiClient.defaults.adapter = adapter as any;
    await apiClient.get('/api/whatever');
    const sent = adapter.mock.calls[0][0];
    expect(sent.headers?.['X-Trace-Id']).toBeDefined();
    expect(typeof sent.headers?.['X-Trace-Id']).toBe('string');
  });

  it('request() unwraps ApiResponse.data and throws on code != 0', async () => {
    const adapter = vi.fn(async (config) => ({
      data: { code: 1, message: 'biz error', data: null, traceId: 't-1' },
      status: 200,
      config,
      headers: {} as any,
    }));
    apiClient.defaults.adapter = adapter as any;
    try {
      await request({ method: 'GET', url: '/api/x' });
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toBe('biz error');
      expect((e as any).code).toBe(1);
      expect((e as any).traceId).toBe('t-1');
    }
  });

  it('request() returns data when code === 0', async () => {
    const adapter = vi.fn(async () => ({
      data: { code: 0, message: 'ok', data: { name: 'alex' } },
      status: 200,
      config: {} as any,
      headers: {} as any,
    }));
    apiClient.defaults.adapter = adapter as any;
    const r = await request<{ name: string }>({ method: 'GET', url: '/api/x' });
    expect(r).toEqual({ name: 'alex' });
  });

  it('clears tokens and rejects when refresh endpoint is hit on 401', async () => {
    // Arrange: valid access token, valid refresh token
    localStorageAdapter.set('auth.accessToken', 'expired-tok');
    localStorageAdapter.set('auth.refreshToken', 'refresh-tok');
    let callCount = 0;
    const adapter = vi.fn(async (config) => {
      callCount += 1;
      if (config.url?.endsWith('/auth/refresh')) {
        // refresh fails
        return Promise.reject({
          config,
          response: { status: 401, data: { code: 0, message: 'no' }, config, headers: {} as any },
          isAxiosError: true,
          toJSON: () => ({}),
          name: 'AxiosError',
          message: 'Request failed',
        });
      }
      return Promise.reject({
        config,
        response: { status: 401, data: { code: 0, message: 'no' }, config, headers: {} as any },
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed',
      });
    });
    apiClient.defaults.adapter = adapter as any;
    await expect(apiClient.get('/api/projects')).rejects.toBeDefined();
    // Tokens should be cleared after refresh fails
    expect(localStorageAdapter.get('auth.accessToken')).toBeNull();
    expect(localStorageAdapter.get('auth.refreshToken')).toBeNull();
  });

  it('does not try to refresh on 401 for /auth/* endpoints', async () => {
    const adapter = vi.fn(async (config) => {
      return Promise.reject({
        config,
        response: { status: 401, data: { code: 0, message: 'bad creds' }, config, headers: {} as any },
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed',
      });
    });
    apiClient.defaults.adapter = adapter as any;
    let refreshCalled = false;
    adapter.mockImplementation(async (config: any) => {
      if (config.url?.endsWith('/auth/refresh')) refreshCalled = true;
      return Promise.reject({
        config,
        response: { status: 401, data: { code: 0, message: 'bad' }, config, headers: {} as any },
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed',
      });
    });
    await expect(apiClient.post('/api/auth/login', {})).rejects.toBeDefined();
    expect(refreshCalled).toBe(false);
  });
});
