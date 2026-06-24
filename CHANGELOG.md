# 播客平台 CHANGELOG

## [0.3.0] - 2026-06-24

### 修改时间
- 2026-06-24（上海时间）

### Security（安全修复）
- 修复 ThrottlerGuard 未注册问题，恢复全局限流（short: 1s/10次, medium: 60s/60次）。在 `auth.module.ts` 注册 `APP_GUARD` 使用 `ThrottlerGuard`，优先于 `JwtAuthGuard` 执行。
- 修复 `LocalStorageAdapter` 路径遍历漏洞，新增 `resolveSafeKey` 方法校验 key 不得包含 `../`，防止任意文件读写。

### Build（构建修复）
- Docker 构建改用 `--frozen-lockfile`（backend + frontend），确保依赖版本与 lockfile 一致，防止依赖漂移。
- 移除 `backend.Dockerfile` 中 `prisma generate || true`，失败即中断构建，不再掩盖错误。
- Docker runtime 镜像改用 `pnpm install --prod --frozen-lockfile`，不再 COPY builder 的全部 node_modules，镜像体积预计减少约 300MB。
- 修复 `step3-tts-mix.ts` 生产环境 fixtures 路径断裂：改用 `process.cwd()` 定位，Dockerfile 补充 `COPY --from=builder /app/backend/src/test/fixtures ./src/test/fixtures`。

### Quality（代码质量）
- 引入 `typescript-eslint` recommended 规则，`eslint.config.js` 不再为空配置。新增 `eslint` 和 `typescript-eslint` 到根 devDependencies。

### 注意事项
- 本次新增了 `eslint` 和 `typescript-eslint` 依赖，需执行 `pnpm install` 完成安装后 `pnpm lint` 才能生效。
- Docker 镜像构建方式变更：runtime 阶段单独安装生产依赖，构建时间可能略增，但镜像体积显著减小。

## [0.2.0] - 2026-06-18

### Smoke Test（本次补充）

- 修改时间：2026-06-18 17:30（上海时间）
- 执行人：TRAE Agent
- 测试范围：v0.2.0 质量闭环提交后的本地测试、构建、线上只读检查

#### 本地验证结果

- 后端测试：`pnpm exec jest --config jest.config.ts --runInBand`
  - 结果：Test Suites 14 passed / 3 skipped；Tests 74 passed / 14 skipped
  - 状态：通过
- 前端测试：`pnpm --filter frontend test`
  - 结果：Test Files 15 passed；Tests 160 passed
  - 状态：通过
- 后端构建：`pnpm --filter backend build`
  - 结果：Nest build passed
  - 状态：通过
- 前端构建：`pnpm --filter frontend build`
  - 结果：`tsc -b && vite build` passed
  - 状态：通过
- 本地构建产物静态服务验证：
  - `vite preview` 后 `http://localhost:5173/` 与 `/book-search` 均返回 200
  - 状态：通过

#### 线上只读检查结果

- `https://podcast-platform-backend-8065.onrender.com/api/health`：返回 `code: 0`、`status: ok`
- `https://podcast-platform-backend-8065.onrender.com/api/bgm/tracks`：返回 12 条 BGM 数据，`code: 0`
- `https://podcast-platform.vercel.app/`：返回 500，`MIDDLEWARE_INVOCATION_FAILED`
- `https://podcast-platform.vercel.app/book-search`：返回 500，`MIDDLEWARE_INVOCATION_FAILED`

#### 发现的问题

1. **Vercel 线上前端 500 错误**
   - 现象：根路径和 `/book-search` 均返回 `500 Internal Server Error`，响应头 `X-Vercel-Error: MIDDLEWARE_INVOCATION_FAILED`
   - 影响：用户无法通过 Vercel 域名访问前端页面
   - 排查结论：本地构建产物通过 `vite preview` 可正常访问 200，说明前端代码与构建输出本身正常；问题出在 Vercel 平台部署侧
   - 可能原因：
     - Vercel 项目 Framework Preset 被错误识别为 Next.js（应为 Vite）
     - Vercel Dashboard 中残留旧版 Edge Middleware 配置
     - 部署缓存异常，需要 Redeploy 并关闭 build cache
   - 建议修复：
     1. 登录 Vercel Dashboard → 项目 Settings → General → Framework Preset 确认为 `Vite`
     2. 检查 Functions / Middleware 标签页是否有未清理的中间件
     3. 在 Deployments 中点击最新部署的 `Redeploy`，勾选 `Use existing Build Cache` 为 No
     4. 确认环境变量 `VITE_API_BASE_URL=https://podcast-platform-backend-8065.onrender.com` 已设置并重新部署

2. **本地完整 E2E 未能执行**
   - 原因：本机 Docker Desktop 未运行，且 scoop 安装的 PostgreSQL 数据目录受 TRAE Sandbox 限制无法启动
   - 影响：未验证真实数据库下的 `auth.e2e-spec.ts`、`full-local.e2e-spec.ts`、`pipeline.e2e-spec.ts`
   - 缓解：单元测试与集成测试已覆盖核心逻辑；建议部署环境补充完整 E2E

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
