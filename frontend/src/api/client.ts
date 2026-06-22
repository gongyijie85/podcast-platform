import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { ENV } from '../constants/env';
import { localStorageAdapter } from '../storage/local-storage.adapter';
import { logger } from '../utils/logger';
import type { ApiResponse } from '@shared/api';

const ACCESS_KEY = 'auth.accessToken';
const REFRESH_KEY = 'auth.refreshToken';

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onRefreshed(token: string): void {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void): void {
  refreshSubscribers.push(cb);
}

const traceId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const apiClient: AxiosInstance = axios.create({
  baseURL: ENV.apiBaseUrl,
  timeout: ENV.apiTimeoutMs,
});

axiosRetry(apiClient, {
  retries: 2,
  shouldResetTimeout: true,
  retryDelay: (retryCount, err) => {
    if (axios.isAxiosError(err) && (err.code === 'ECONNABORTED' || !err.response)) {
      return retryCount * 2_000;
    }
    return axiosRetry.exponentialDelay(retryCount, err);
  },
  retryCondition: (err) => {
    if (axios.isAxiosError(err)) {
      const s = err.response?.status ?? 0;
      return s === 0 || s >= 500 || err.code === 'ECONNABORTED';
    }
    return false;
  },
});

apiClient.interceptors.request.use((cfg) => {
  cfg.headers = cfg.headers ?? {};
  cfg.headers['X-Trace-Id'] = traceId();
  const token = localStorageAdapter.get<string>(ACCESS_KEY);
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

apiClient.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;
    const url = original.url || '';
    const isAuthEndpoint = url.includes('/auth/');

    if (status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      if (isRefreshing) {
        return new Promise((resolve) => {
          addRefreshSubscriber((token) => {
            original.headers = { ...(original.headers || {}), Authorization: `Bearer ${token}` };
            resolve(apiClient(original));
          });
        });
      }
      isRefreshing = true;
      const refresh = localStorageAdapter.get<string>(REFRESH_KEY);
      if (!refresh) {
        isRefreshing = false;
        return Promise.reject(error);
      }
      try {
        const resp = await axios.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
          `${ENV.apiBaseUrl}/auth/refresh`,
          { refreshToken: refresh },
        );
        const tokens = resp.data.data;
        if (tokens) {
          localStorageAdapter.set(ACCESS_KEY, tokens.accessToken);
          localStorageAdapter.set(REFRESH_KEY, tokens.refreshToken);
          onRefreshed(tokens.accessToken);
          original.headers = { ...(original.headers || {}), Authorization: `Bearer ${tokens.accessToken}` };
        }
        isRefreshing = false;
        return apiClient(original);
      } catch (e) {
        isRefreshing = false;
        localStorageAdapter.remove(ACCESS_KEY);
        localStorageAdapter.remove(REFRESH_KEY);
        logger.warn('refresh failed, redirecting to login', e);
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

/** Unwrap ApiResponse or throw Error with the server's message + code. */
export async function request<T>(cfg: AxiosRequestConfig): Promise<T> {
  try {
    const resp = await apiClient.request<ApiResponse<T>>(cfg);
    const body = resp.data;
    if (body.code !== 0) {
      const err = new Error(body.message || 'Request failed') as Error & { code?: number; traceId?: string };
      err.code = body.code;
      err.traceId = body.traceId;
      throw err;
    }
    return body.data as T;
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const body = e.response?.data as ApiResponse<T> | undefined;
      if (body && typeof body === 'object' && 'code' in body) {
        const err = new Error(body.message || e.message) as Error & { code?: number; traceId?: string };
        err.code = body.code;
        err.traceId = body.traceId;
        throw err;
      }
    }
    throw e;
  }
}
