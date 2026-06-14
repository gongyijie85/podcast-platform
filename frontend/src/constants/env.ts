export const ENV = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, '')
    : 'https://podcast-platform-backend-8065.onrender.com',
  wsUrl: (import.meta.env.VITE_WS_URL as string) || 'ws://localhost:3001',
  defaultLang: (import.meta.env.VITE_DEFAULT_LANG as string) || 'zh-CN',
  maxBooks: parseInt((import.meta.env.VITE_MAX_BOOKS as string) || '20', 10),
};
