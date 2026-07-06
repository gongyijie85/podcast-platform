# 环境变量清单

- 版本号：0.5.0
- 修改时间：2026-07-06（上海时间）
- 适用范围：podcast-platform 前后端本地开发与生产部署

## 约定

- **必填**：未设置将导致服务无法启动或核心功能不可用。
- **可选**：未设置时走默认值或 mock 兜底。
- **本地默认**：本地开发可直接使用 `.env.example` 的值。
- **生产必改**：上线前必须替换为真实值，使用默认值会被 `main.ts` 启动校验拦截或存在安全风险。
- **归属**：`后端` / `前端` / `共用`。

## 1. 部署与跨域（Deployment / CORS）

| 变量 | 必填 | 本地默认 | 生产必改 | 归属 | 说明 |
|------|------|----------|----------|------|------|
| `CORS_ORIGINS` | 是 | `http://localhost:5173` | 是（设为 Vercel 域名） | 后端 | 允许的前端来源，逗号分隔多个域名 |
| `JWT_SECRET` | 是 | 空 | 是（32+ 位随机串） | 后端 | 访问令牌签名密钥，生产环境 `main.ts` 强制校验非空非默认 |
| `JWT_REFRESH_SECRET` | 可选 | 空（复用 `JWT_SECRET`） | 是（建议独立） | 后端 | 刷新令牌签名密钥，建议生产单独设置 |

生成密钥命令：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 2. 后端基础（Database / Redis）

| 变量 | 必填 | 本地默认 | 生产必改 | 归属 | 说明 |
|------|------|----------|----------|------|------|
| `DATABASE_URL` | 是 | `postgresql://postgres:postgres@postgres:5432/podcast` | 是（Neon/Supabase/Render Postgres） | 后端 | PostgreSQL 连接串，生产环境 `main.ts` 强制校验非默认 |
| `REDIS_HOST` | 是 | `redis` | 是 | 后端 | BullMQ 队列依赖 |
| `REDIS_PORT` | 可选 | `6379` | 否 | 后端 | Redis 端口 |
| `REDIS_PASSWORD` | 可选 | 空 | 是（生产设密码） | 后端 | Redis 密码 |
| `JWT_ACCESS_EXPIRES` | 可选 | `15m` | 否 | 后端 | 访问令牌有效期 |
| `JWT_REFRESH_EXPIRES` | 可选 | `7d` | 否 | 后端 | 刷新令牌有效期 |

## 3. 对象存储（MinIO / OSS）

| 变量 | 必填 | 本地默认 | 生产必改 | 归属 | 说明 |
|------|------|----------|----------|------|------|
| `STORAGE_DRIVER` | 可选 | `minio` | 否（生产建议 OSS） | 后端 | 存储驱动：`minio` / `oss` / `local` |
| `MINIO_ENDPOINT` | 条件 | `minio` | 是（生产改 OSS 或独立 MinIO） | 后端 | `STORAGE_DRIVER=minio` 时必填 |
| `MINIO_PORT` | 可选 | `9000` | 否 | 后端 | MinIO 端口 |
| `MINIO_ACCESS_KEY` | 条件 | `minioadmin` | 是 | 后端 | MinIO 访问密钥 |
| `MINIO_SECRET_KEY` | 条件 | `minioadmin` | 是 | 后端 | MinIO 秘钥 |
| `MINIO_BUCKET` | 可选 | `podcast` | 否 | 后端 | 存储桶名 |
| `MINIO_USE_SSL` | 可选 | `false` | 生产建议 `true` | 后端 | 是否启用 SSL |
| `OSS_ACCESS_KEY` | 条件 | 空 | 是（用 OSS 时） | 后端 | `STORAGE_DRIVER=oss` 时必填 |
| `OSS_SECRET_KEY` | 条件 | 空 | 是 | 后端 | OSS 秘钥 |
| `OSS_BUCKET` | 条件 | 空 | 是 | 后端 | OSS 桶名 |
| `OSS_REGION` | 条件 | 空 | 是 | 后端 | OSS 区域 |
| `OSS_CDN_DOMAIN` | 可选 | 空 | 否 | 后端 | OSS CDN 域名，加速下载 |

## 4. LLM 服务（小米 MiMo / Token Plan）

| 变量 | 必填 | 本地默认 | 生产必改 | 归属 | 说明 |
|------|------|----------|----------|------|------|
| `LLM_PROVIDER` | 可选 | `mimo` | 否 | 后端 | LLM 供应商，留空走 mock 兜底 |
| `LLM_API_KEY` | 可选 | 空 | 是（需 AI 生成时） | 后端 | LLM API Key，留空则脚本生成走 mock |
| `LLM_ENDPOINT` | 可选 | `https://token-plan-sgp.xiaomimimo.com/v1` | 否 | 后端 | LLM API 端点 |
| `LLM_MODEL` | 可选 | `mimo-v2.5-pro` | 否 | 后端 | 模型名 |
| `LLM_MAX_COMPLETION_TOKENS` | 可选 | `4096` | 否 | 后端 | 单次最大补全 token 数 |
| `LLM_TOP_P` | 可选 | `0.9` | 否 | 后端 | 采样参数 top_p |

## 4.1 封面识别 LLM Vision（agnes-2.0-flash，免费）

用于 `/scan` 页面拍摄图书封面识别书名+作者。留空则识别服务不可用，前端提示手动输入书名。

文档：https://agnes-ai.com/zh-Hans/docs/agnes-20-flash

| 变量 | 必填 | 本地默认 | 生产必改 | 归属 | 说明 |
|------|------|----------|----------|------|------|
| `LLM_VISION_ENDPOINT` | 可选 | `https://apihub.agnes-ai.com/v1` | 否 | 后端 | agnes OpenAI 兼容端点 |
| `LLM_VISION_API_KEY` | 可选 | 空 | 是（需扫码识别时） | 后端 | agnes API Key，留空则跳过识别 |
| `LLM_VISION_MODEL` | 可选 | `agnes-2.0-flash` | 否 | 后端 | Vision 模型名 |

## 5. TTS 服务

| 变量 | 必填 | 本地默认 | 生产必改 | 归属 | 说明 |
|------|------|----------|----------|------|------|
| `MIMO_TTS_API_KEY` | 可选 | 空（复用 `LLM_API_KEY`） | 是（需 TTS 时） | 后端 | 小米 MiMo TTS Key |
| `MIMO_TTS_ENDPOINT` | 可选 | `https://token-plan-sgp.xiaomimimo.com/v1` | 否 | 后端 | TTS 端点 |
| `MIMO_TTS_MODEL` | 可选 | `mimo-v2.5-tts` | 否 | 后端 | TTS 模型 |
| `MIMO_TTS_FORMAT` | 可选 | `wav` | 否 | 后端 | 输出音频格式 |
| `VOLC_TTS_APP_ID` | 可选 | 空 | 是（用火山时） | 后端 | 火山引擎 TTS App ID |
| `VOLC_TTS_TOKEN` | 可选 | 空 | 是 | 后端 | 火山引擎 TTS Token |
| `VOLC_TTS_CLUSTER` | 可选 | `volcano_tts` | 否 | 后端 | 火山集群 |
| `AZURE_TTS_KEY` | 可选 | 空 | 是（用 Azure 时） | 后端 | Azure TTS Key |
| `AZURE_TTS_REGION` | 可选 | `eastasia` | 否 | 后端 | Azure 区域 |
| `DOUBAO_API_KEY` | 可选 | 空 | 否 | 后端 | 豆包遗留 fallback，建议改用 `LLM_*` |
| `DOUBAO_ENDPOINT` | 可选 | 空 | 否 | 后端 | 豆包端点 |
| `DOUBAO_MODEL` | 可选 | 空 | 否 | 后端 | 豆包模型 |

## 6. 图书数据源

| 变量 | 必填 | 本地默认 | 生产必改 | 归属 | 说明 |
|------|------|----------|----------|------|------|
| `OPENLIBRARY_BASE` | 可选 | `https://openlibrary.org` | 否 | 后端 | OpenLibrary API |
| `GOOGLE_BOOKS_BASE` | 可选 | `https://www.googleapis.com/books/v1` | 否 | 后端 | Google Books API |
| `GOOGLE_API_KEY` | 可选 | 空 | 否（建议设） | 后端 | Google Books API Key，提升配额 |
| `BOOKRANK_API_BASE_URL` | 可选 | `https://bookrank-ckml.onrender.com` | 否 | 后端 | BookRank 畅销榜 API |

## 7. 应用配置（App）

| 变量 | 必填 | 本地默认 | 生产必改 | 归属 | 说明 |
|------|------|----------|----------|------|------|
| `PORT` | 可选 | `3001` | 否 | 后端 | 服务端口 |
| `LOG_LEVEL` | 可选 | `info` | 生产建议 `warn` | 后端 | pino 日志级别 |
| `MAX_RETRY` | 可选 | `3` | 否 | 后端 | 第三方依赖重试次数 |
| `MAX_BOOKS_PER_PROJECT` | 可选 | `20` | 否 | 后端 | 单项目最大图书数 |
| `MAX_SCRIPT_WORDS` | 可选 | `3000` | 否 | 后端 | 脚本最大字数 |
| `MAX_SCRIPT_DURATION_MS` | 可选 | `900000` | 否 | 后端 | 脚本生成超时（毫秒） |
| `PDF_FONT_PATH` | 可选 | `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc` | 否 | 后端 | PDF 导出字体路径，Windows 需替换 |

## 8. 前端（Vite）

| 变量 | 必填 | 本地默认 | 生产必改 | 归属 | 说明 |
|------|------|----------|----------|------|------|
| `VITE_API_BASE_URL` | 是 | `http://localhost:3001` | 是（Render 后端域名） | 前端 | 后端 API 基础地址 |
| `VITE_WS_URL` | 是 | `ws://localhost:3001` | 是（生产 wss://） | 前端 | WebSocket 地址，用于进度推送 |
| `VITE_DEFAULT_LANG` | 可选 | `zh-CN` | 否 | 前端 | 默认语言 |
| `VITE_MAX_BOOKS` | 可选 | `20` | 否 | 前端 | 前端图书数量上限，需与 `MAX_BOOKS_PER_PROJECT` 一致 |
| `VITE_API_TIMEOUT_MS` | 可选 | `90000` | 否 | 前端 | API 超时（毫秒） |

## 生产部署最小清单

上线 Render 后端 + Vercel 前端时，至少设置以下变量：

**后端（Render）：**
- `DATABASE_URL`（Render Postgres 或 Neon）
- `REDIS_HOST` / `REDIS_PASSWORD`（Render Redis 或 Upstash）
- `CORS_ORIGINS`（Vercel 域名）
- `JWT_SECRET` / `JWT_REFRESH_SECRET`（32+ 位随机串）
- `STORAGE_DRIVER` + 对应存储凭证（OSS 或 MinIO）
- `LLM_API_KEY` + `MIMO_TTS_API_KEY`（需 AI 生成时）

**前端（Vercel）：**
- `VITE_API_BASE_URL`（Render 后端域名，如 `https://xxx.onrender.com`）
- `VITE_WS_URL`（`wss://xxx.onrender.com`）

## 健康检查路径

> ⚠️ **重要**：后端健康检查路径为 **`/api/health`**（全局前缀 `/api`）。
> - `deploy.md` 中 Vercel rewrite 示例已使用 `/api/health`，正确。
> - `deployment.md` 中 K8s liveness/readiness probe 示例误写为 `/health`，需修正为 `/api/health`。

## 相关文档

- [部署指南（Vercel + Render）](./deploy.md)
- [本地开发与 Docker Compose](./deployment.md)
- [发布流程](./release-process.md)
- [回滚手册](./rollback-playbook.md)
- [监控与告警](./monitoring-alerting.md)
