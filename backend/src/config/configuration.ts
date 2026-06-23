// Centralized configuration. All env vars go through here.
const redisUrl = process.env.REDIS_URL ? new URL(process.env.REDIS_URL) : null;
const hasExternalStorageConfig = Boolean(process.env.MINIO_ENDPOINT || process.env.OSS_BUCKET);

const parseIntEnv = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const configuration = () => ({
  port: parseIntEnv(process.env.PORT, 3001),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  logLevel: process.env.LOG_LEVEL || 'info',
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/podcast',
  },
  redis: {
    url: process.env.REDIS_URL || '',
    host: process.env.REDIS_HOST || redisUrl?.hostname || 'localhost',
    port: parseIntEnv(process.env.REDIS_PORT || redisUrl?.port, 6379),
    username: process.env.REDIS_USERNAME || (redisUrl?.username ? decodeURIComponent(redisUrl.username) : undefined),
    password: process.env.REDIS_PASSWORD || (redisUrl?.password ? decodeURIComponent(redisUrl.password) : undefined),
    tls: process.env.REDIS_TLS === 'true' || redisUrl?.protocol === 'rediss:',
  },
  queue: {
    mode: process.env.QUEUE_MODE || (process.env.REDIS_HOST || process.env.REDIS_URL ? 'redis' : 'local'),
    enqueueTimeoutMs: parseIntEnv(process.env.QUEUE_ENQUEUE_TIMEOUT_MS, 3000),
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER || (hasExternalStorageConfig ? 'minio' : 'local')) as 'minio' | 'oss' | 'local',
    local: {
      root: process.env.LOCAL_STORAGE_ROOT || 'storage',
    },
    minio: {
      endpoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000', 10),
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      bucket: process.env.MINIO_BUCKET || 'podcast',
      useSSL: process.env.MINIO_USE_SSL === 'true',
    },
    oss: {
      accessKey: process.env.OSS_ACCESS_KEY || '',
      secretKey: process.env.OSS_SECRET_KEY || '',
      bucket: process.env.OSS_BUCKET || '',
      region: process.env.OSS_REGION || '',
      cdnDomain: process.env.OSS_CDN_DOMAIN || '',
    },
  },
  thirdParty: {
    llm: {
      provider: process.env.LLM_PROVIDER || 'mimo',
      apiKey: process.env.LLM_API_KEY || process.env.DOUBAO_API_KEY || '',
      endpoint: process.env.LLM_ENDPOINT || process.env.DOUBAO_ENDPOINT || 'https://token-plan-sgp.xiaomimimo.com/v1',
      model: process.env.LLM_MODEL || process.env.DOUBAO_MODEL || 'mimo-v2.5-pro',
      maxCompletionTokens: parseInt(process.env.LLM_MAX_COMPLETION_TOKENS || '4096', 10),
      topP: parseFloat(process.env.LLM_TOP_P || '0.9'),
    },
    doubao: {
      apiKey: process.env.DOUBAO_API_KEY || '',
      endpoint: process.env.DOUBAO_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3',
      model: process.env.DOUBAO_MODEL || 'doubao-pro-32k',
    },
    volcTts: {
      appId: process.env.VOLC_TTS_APP_ID || '',
      token: process.env.VOLC_TTS_TOKEN || '',
      cluster: process.env.VOLC_TTS_CLUSTER || 'volcano_tts',
    },
    mimoTts: {
      apiKey: process.env.MIMO_TTS_API_KEY || process.env.LLM_API_KEY || '',
      endpoint: process.env.MIMO_TTS_ENDPOINT || process.env.LLM_ENDPOINT || 'https://token-plan-sgp.xiaomimimo.com/v1',
      model: process.env.MIMO_TTS_MODEL || 'mimo-v2.5-tts',
      format: process.env.MIMO_TTS_FORMAT || 'wav',
    },
    azureTts: {
      key: process.env.AZURE_TTS_KEY || '',
      region: process.env.AZURE_TTS_REGION || 'eastasia',
    },
    openLibrary: {
      base: process.env.OPENLIBRARY_BASE || 'https://openlibrary.org',
    },
    googleBooks: {
      base: process.env.GOOGLE_BOOKS_BASE || 'https://www.googleapis.com/books/v1',
      apiKey: process.env.GOOGLE_API_KEY || '',
    },
    bookRank: {
      base: process.env.BOOKRANK_API_BASE_URL || 'https://bookrank-ckml.onrender.com',
    },
    bookMetadata: {
      allowMock: process.env.BOOK_METADATA_ALLOW_MOCK === 'true',
    },
  },
  limits: {
    maxBooks: parseIntEnv(process.env.MAX_BOOKS_PER_PROJECT, 20),
    maxScriptWords: parseIntEnv(process.env.MAX_SCRIPT_WORDS, 3000),
    maxScriptDurationMs: parseIntEnv(process.env.MAX_SCRIPT_DURATION_MS, 900000),
    maxRetry: parseIntEnv(process.env.MAX_RETRY, 3),
  },
});

export type AppConfig = ReturnType<typeof configuration>;
