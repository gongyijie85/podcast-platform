const normalizeApiBaseUrl = (value?: string): string => {
  const raw = (value || '/api').replace(/\/$/, '');
  return raw.endsWith('/api') ? raw : `${raw}/api`;
};

export const ENV = {
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  wsUrl: (import.meta.env.VITE_WS_URL as string) || 'ws://localhost:3001',
  defaultLang: (import.meta.env.VITE_DEFAULT_LANG as string) || 'zh-CN',
  maxBooks: parseInt((import.meta.env.VITE_MAX_BOOKS as string) || '20', 10),
};
