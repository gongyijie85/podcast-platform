# 播客平台 CHANGELOG

## [0.2.0] - 2026-06-18

### Added
- 新增质量闭环能力：脚本生成返回 `{ segments, episodeBrief }`，`ScriptDto` 新增 `episodeBrief` 与 `qualityReport`。
- 新增确定性质量分析器 `script-quality.ts`，检查图书覆盖率、台词具体度、跨书比较、口头禅密度、书名遗漏、事实边界风险。
- 项目详情页"脚本"页签新增：节目策划 brief、质量自检报告、快速返修按钮（更深入、少口头禅、更轻松、缩短到 8 分钟、加强跨书比较）、自定义返修指令。
- `POST /projects/:id/regenerate` 支持 `{ scriptTemplate, revisionPreset, customInstruction }`。
- 新增 BookRank 适配器 `bookrank.adapter.ts`，支持从 BookRank 导入畅销榜图书。
- 新增 BookLibrary 服务 `book-library.service.ts`，管理图书陈列库。
- 新增 Xiaomi MiMo TTS 适配器 `xiaomi-mimo.adapter.ts`，统一 LLM 与 TTS 命名为 Xiaomi MiMo / Token Plan。
- 新增 OpenAI 兼容 LLM 适配器 `openai-compatible-llm.adapter.ts`。
- 新增数据库迁移：`20260616113000_project_books_metadata_and_script_template`、`20260618112000_book_library_items`。
- 新增交接文档 `docs/ai-podcast-quality-handoff.md`，包含部署步骤、环境变量清单、数据库迁移、免费版风险、smoke test、排障指南。

### Changed
- `/projects/new` 默认脚本模板改为 `audio-overview`（AI 深潜播客）。
- 后端 LLM 生成返回从裸 `segments` 升级为 `{ segments, episodeBrief }`。
- 旧 pipeline 层兼容新旧 LLM adapter 返回形状，避免历史测试和 fixture 流程断裂。
- 移除 `frontend/vercel.json` 硬编码 `/api/*` rewrite 到 `podcast-platform-backend-8065.onrender.com`，部署时完全依赖 `VITE_API_BASE_URL`。
- 前端 API base URL 归一化逻辑增强，避免 `/api/api` 和缺少 `/api` 两类问题。

### Tests
- 前端测试：15 个测试文件通过，160 个测试通过。
- 后端测试：14 个测试套件通过，3 个跳过；74 个测试通过。
- 后端构建：Nest build passed。
- 前端构建：tsc -b && vite build passed。
- 浏览器轻验收：两本 BookRank 图书、中文简介、来源、AI 深潜播客、专业导读、BGM 模板均能渲染。

### Deployment Notes
- Vercel 部署时必须设置 `VITE_API_BASE_URL=https://<your-backend>.onrender.com`，不再依赖 rewrite 代理。
- Render 后端 `CORS_ORIGINS` 必须包含 Vercel 域名，否则浏览器报 CORS。
- Render 免费版限制：15 分钟无流量休眠、Free Postgres 30 天过期、本地文件系统 ephemeral。真实业务测试建议使用 Neon/Supabase/Render paid Postgres 和 OSS/S3 存储。
- 数据库迁移需手动执行 `pnpm --filter backend prisma:deploy`，Docker 启动命令不会自动执行。
- 降低冷启动影响：用 UptimeRobot 或 cron-job.org 每 10 分钟访问 `/api/health`。

## [0.1.1] - 2026-06-14

### Added
- 新增项目收尾接口：`POST /api/projects/sync`、`POST /api/projects/:id/cancel`、`POST /api/projects/:id/regenerate`、`POST /api/projects/:id/share`、`GET /api/share/:token`。
- 新增用户偏好接口：`GET/PATCH /api/users/me/preferences`，用于最近音色/BGM、字幕样式和语言偏好。
- 新增分享试听页 `/share/:token`、播客封面 fallback、游客项目登录后 sync、脚本模板选择、环境音可关闭配置。
- 新增部署验证脚本：`scripts/verify-deploy.ps1`、`scripts/e2e-online.ps1`。

### Changed
- 增强登录/注册表单本地校验：邮箱格式、密码长度、昵称长度、trim 后提交。
- 增强图书搜索失败体验：后端失败时继续使用占位数据，并显示可关闭 warning。
- 增强项目创建失败体验：区分项目创建失败、脚本保存 warning、流水线启动失败和生成失败状态。
- 更新测试报告与交接文档，移除已过期的 localStorage 测试失败和 BGM 500 结论。
- 项目详情接入取消、重新生成、删除、分享链接和字幕样式调整。
- 前端 API base URL 归一化为单个 `/api`，避免 `/api/api` 和缺少 `/api` 两类部署配置问题。
- Vercel 新增 `/api/*` 代理到 Render 后端，线上前端使用同源 `/api` 请求规避 CORS。
- Dashboard 访客态不再请求登录用户项目列表，避免首页显示 `Missing bearer token`。
- Doubao/Mimo 脚本生成提示词统一为 `{"segments":[...]}` JSON object，与 `response_format` 保持一致。
- DoubaoAdapter 增加严格 JSON prompt 重试，首次 malformed JSON 时不再直接进入 mock fallback。

### Database
- Prisma schema 新增 `Project.coverUrl` 与 `ShareLink`。
- 新增 migration：`20260614064000_share_links_and_cover`。

### Tests
- 前端测试：15 个测试文件通过，153 个测试通过。
- 后端测试：9 个测试套件通过，3 个跳过；45 个测试通过，14 个跳过。
- 后端 E2E：本地 Postgres/Redis/MinIO 环境下 3 个测试套件通过，14 个测试通过。
- 前端构建：通过。
- 后端构建：通过。
- 线上只读验证：`/api/health` 与 `/api/bgm/tracks` 均返回 `code: 0`。
- 大模型真实 smoke：返回 24 个 segments，覆盖 6 个 stage，未进入 mock fallback。
- 本地写入型 E2E 覆盖注册、登录、游客项目 sync、偏好、项目生成、取消、重新生成、分享和删除；测试后本地 DB 已清理。
- 本地 mock pipeline 生成播客成功，产出 `backend/tmp/exports/ac363a4c-3f73-4f2c-9e21-fec11e480e0c.mp3`。
- Vercel 生产部署已更新，线上 `/`、`/book-search`、`/projects/new`、`/login`、`/register` 冒烟通过。

### Deployment Notes
- Vercel 生产前端已使用同源 `/api` 代理部署；如再次 Redeploy，仍建议关闭 build cache。
- 当前 Vercel 同源代理部署使用 `VITE_API_BASE_URL=/api`；直连 Render 时使用 `https://podcast-platform-backend-8065.onrender.com`，末尾不带 `/api`。
- 线上 E2E 使用一次性邮箱人工验证，不自动调用注册接口。
- Render 后端需重新部署后，线上才会包含本地最新的 DoubaoAdapter 解析修复和新增后端接口。

## [0.1.0] - 2026-06-14

### 项目状态
- AI 播客制作平台交接版本。

### 已完成
- 后端核心模块完成。
- 前端核心页面完成。
- Neon PostgreSQL 数据库创建和迁移完成。
- Docker 从 Alpine 改为 bookworm-slim，解决 Prisma libssl 问题。
- 所有前端 API 文件已移除重复 `/api` 前缀。
- 环境变量配置完成。

### 已知限制
1. Render free tier 冷启动需要 30s+
2. Pipeline 只能在 dev 模式跑，生产环境可能返回 `70006`
3. Render ephemeral FS：导出的 MP3 重启后丢失
4. TTS 使用 mock 模式，Volcengine API Key 未配置
