# Podcast Platform

> ISBN → AI Podcast 一站式自动生产平台。
> 当前版本：**v0.6.3**（图书识别结果中文翻译与持久化）
> 完整 PRD 见 `docs/podcast-platform-prd.md`；架构见 `docs/podcast-platform-architecture.md`。
> 变更日志见 [`CHANGELOG.md`](CHANGELOG.md)。

## 核心能力

- **选书库**：从 BookRank 导入畅销榜图书，管理图书元数据与中文简介，支持主播口播稿（AI 生成 + 手动编辑），为直播带货做准备。
- **拍照找书**：直播时拍摄书背面 ISBN 条码或封面，自动识别并跳转口播稿页面；支持就地手动搜索和最近识别历史。
- **AI 深潜播客**：默认脚本模板为 `audio-overview`，生成专业导读内容。
- **质量闭环**：脚本生成后自动分析图书覆盖率、台词具体度、跨书比较、口头禅密度，提供质量自检报告与快速返修按钮（更深入、少口头禅、更轻松、缩短到 8 分钟、加强跨书比较）。
- **BGM 混音**：12 首环境音模板，支持自定义选择与关闭。
- **多格式导出**：TXT / PDF / MP3 / ZIP，PDF 支持中文字体。

## 部署

本项目支持三条部署路径：

- **免费改善大陆访问**：Cloudflare Pages 免费前端 + Render Free 后端，适合先止血。
- **Vercel + Render 免费方案**：原始免费部署，海外访问可以，大陆访问不稳定。
- **不备案海外 VPS 单机部署**：香港/新加坡 VPS，适合后端也要更稳时。

详细 step-by-step 指南：[docs/deploy.md](docs/deploy.md)
免费改善大陆访问：[docs/free-china-access-options.md](docs/free-china-access-options.md)
不备案香港/新加坡部署：[docs/no-icp-overseas-deploy.md](docs/no-icp-overseas-deploy.md)
质量闭环与部署交接文档：[docs/ai-podcast-quality-handoff.md](docs/ai-podcast-quality-handoff.md)

- **frontend**: <https://pages.cloudflare.com>（Free tier，推荐大陆访问先试）
- **backend**: <https://render.com>（Free tier + Docker）

> ⚠️ **生产环境注意**：
> - Render free tier 文件系统是 ephemeral（重启即清空），导出的 MP3 需在 24h 内下载，真实业务测试建议使用 OSS/S3。
> - Render Free Postgres 30 天过期，真实业务测试建议使用 Neon / Supabase / Render paid Postgres。
> - Cloudflare Pages 免费方案使用 `VITE_API_BASE_URL=/api` + `BACKEND_URL=https://<your-backend>.onrender.com`。
> - Vercel 部署时必须设置 `VITE_API_BASE_URL=https://<your-backend>.onrender.com`，不再依赖 rewrite 代理。

## 快速开始

### 方式 A：Docker Compose（推荐）

```bash
# 1. 复制环境变量
cp .env.example .env

# 2. 一键起全栈（PG/Redis/MinIO/backend/frontend）
pnpm install
docker compose up -d

# 3. 健康检查
curl http://localhost:3001/api/health
# => {"code":0,"data":{"status":"ok"},"message":"ok"}

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
- **第三方**：Open Library / Google Books / BookRank / Xiaomi MiMo + Token Plan / MiMo TTS / 火山 TTS / Azure TTS（全部支持 mock 兜底）

## 关键命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 同时启前后端 dev server |
| `pnpm build` | 构建前后端 |
| `pnpm lint` | 运行 ESLint 代码检查（typescript-eslint recommended + React Hooks；新增 error 会阻断，历史债务先以 warning 输出） |
| `pnpm prisma:migrate` | 跑 Prisma migration |
| `pnpm seed:bgm` | 灌 BGM 12 首种子数据 |
| `docker compose up -d` | 启全栈 |
| `curl http://localhost:3001/api/health` | 后端健康检查 |

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

- [ ] `curl http://localhost:3001/api/health` 返回 `{"code":0,"data":{"status":"ok"},"message":"ok"}`
- [ ] 浏览器打开 `http://localhost:5173` 看到 "Podcast Platform" 占位页 + 4 步 Stepper
- [ ] 4 步流程（选书→配置→生成→导出）路由可达
- [ ] 游客模式：localStorage 持久化
- [ ] 注册/登录：JWT 持久化

## Mock 兜底说明

| 第三方 | 检测变量 | Mock 行为 |
|--------|----------|-----------|
| Open Library | `OPENLIBRARY_BASE` 不可达 | 返回 5 本示例书 |
| Google Books | 同上 | 返回 3 本示例书 |
| Xiaomi MiMo / Token Plan LLM | `LLM_API_KEY` 为空 | 返回固定双人播客脚本 |
| LLM 直播口播稿生成 | `LLM_API_KEY` 缺失或调用失败 | 模板化生成 100-200 字口播稿 |
| BookRank | `BOOKRANK_API_BASE_URL` 不可达 | 导入接口返回错误，不伪造畅销榜数据 |
| 火山 TTS | `VOLC_TTS_APP_ID` 为空 | 返回 1s 静音 MP3（Buffer） |
| Azure TTS | `AZURE_TTS_KEY` 为空 | 同上 |

## License

MIT
