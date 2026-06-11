# Podcast Platform

> ISBN → AI Podcast 一站式自动生产平台。  
> 完整 PRD 见 `docs/podcast-platform-prd.md`；架构见 `docs/podcast-platform-architecture.md`。

## 快速开始

### 方式 A：Docker Compose（推荐）

```bash
# 1. 复制环境变量
cp .env.example .env

# 2. 一键起全栈（PG/Redis/MinIO/backend/frontend）
pnpm install
docker compose up -d

# 3. 健康检查
curl http://localhost:3001/health
# => {"status":"ok"}

# 浏览器
open http://localhost:5173
```

### 方式 B：本地 dev 模式（不依赖 Docker）

```bash
# 需要本机已装：Node 20+, pnpm 9+, PostgreSQL 15+, Redis 7+
pnpm install
pnpm dev          # 同时启 backend(3001) 和 frontend(5173)
```

## 目录结构

```
podcast-platform/
├── frontend/          # Vite + React 18 + TS + MUI + Tailwind
├── backend/           # NestJS 10 + Prisma + BullMQ
├── shared/            # 前后端共享类型
├── infra/             # Docker / nginx / init scripts
├── docs/              # 架构 / API 契约 / mermaid
├── docker-compose.yml
└── .env.example
```

## 技术栈

- **前端**：Vite + React 18 + TypeScript + MUI v5 + Tailwind + Zustand + Socket.IO Client + wavesurfer.js + TipTap
- **后端**：NestJS 10 + Prisma 5 + BullMQ 5 + Socket.IO + JWT
- **存储**：PostgreSQL 15 + Redis 7 + MinIO (本地) / 阿里云 OSS (生产)
- **第三方**：Open Library / Google Books / 豆包 LLM / 火山 TTS / Azure TTS（全部支持 mock 兜底）

## 关键命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 同时启前后端 dev server |
| `pnpm build` | 构建前后端 |
| `pnpm prisma:migrate` | 跑 Prisma migration |
| `pnpm seed:bgm` | 灌 BGM 12 首种子数据 |
| `docker compose up -d` | 启全栈 |
| `curl http://localhost:3001/health` | 后端健康检查 |

### 跑后端 e2e 测试前

`backend/test/auth.e2e-spec.ts` 会真正访问 `/api/auth/*` 与 `/api/projects/*`，
需要 Postgres + Redis + MinIO 都在跑。**必须先：**

```bash
docker compose up postgres redis minio -d
cd backend
pnpm prisma:migrate
pnpm test:e2e
```

无 Docker 环境的开发机只能跑 `pnpm test`（unit tests，2/4 套件通过）。
详见 `backend/README.md`。

## 端口分配

| 服务 | 端口 |
|------|------|
| 前端 (Nginx) | 5173 |
| 后端 (NestJS) | 3001 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO API | 9000 |
| MinIO Console | 9001 |

## 启动检查清单

- [ ] `curl http://localhost:3001/health` 返回 `{"status":"ok"}`
- [ ] 浏览器打开 `http://localhost:5173` 看到 "Podcast Platform" 占位页 + 4 步 Stepper
- [ ] 4 步流程（选书→配置→生成→导出）路由可达
- [ ] 游客模式：localStorage 持久化
- [ ] 注册/登录：JWT 持久化

## Mock 兜底说明

| 第三方 | 检测变量 | Mock 行为 |
|--------|----------|-----------|
| Open Library | `OPENLIBRARY_BASE` 不可达 | 返回 5 本示例书 |
| Google Books | 同上 | 返回 3 本示例书 |
| 豆包 LLM | `DOUBAO_API_KEY` 为空 | 返回固定 8 段对话脚本 |
| 火山 TTS | `VOLC_TTS_APP_ID` 为空 | 返回 1s 静音 MP3（Buffer） |
| Azure TTS | `AZURE_TTS_KEY` 为空 | 同上 |

## License

MIT
