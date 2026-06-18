# 播客平台测试报告

## 测试时间
2026-06-15 11:46

## 测试结果概览

### ✅ 通过
- 前端单元/组件测试：15 个测试文件通过，153 个测试通过
- 后端单元测试：9 个测试套件通过，3 个跳过；45 个测试通过，14 个跳过
- 前端生产构建：TypeScript 编译和 Vite build 通过
- 后端生产构建：Nest build 通过
- 后端 E2E 测试：本地 Postgres/Redis/MinIO 环境下 3 个测试套件通过，14 个测试通过
- 大模型真实链路：Doubao/Mimo 返回 24 个脚本段落，覆盖 6 个 stage，未进入 mock fallback
- 后端健康检查：`https://podcast-platform-backend-8065.onrender.com/api/health` 返回 `code: 0`
- BGM API：`https://podcast-platform-backend-8065.onrender.com/api/bgm/tracks` 返回 `code: 0` 和 12 条曲目
- `localStorage.clear is not a function`：已由 `frontend/vitest.setup.ts` 的 `MemoryStorage` mock 修复
- P0-P2 收尾项：本地已补项目 sync/cancel/regenerate/share、偏好 API、分享页、脚本模板、环境音配置、封面 fallback、最近 BGM/字幕偏好

### ⚠️ 待人工验证
- Vercel 最新部署需确认使用无缓存重部署
- Vercel 当前推荐使用同源代理：`VITE_API_BASE_URL=/api`；如改为直连 Render，则使用 `https://podcast-platform-backend-8065.onrender.com` 且末尾不带 `/api`
- 线上无痕窗口 Network 中不得再出现 `/api/api/`
- 线上注册/登录/创建项目/生成/下载需人工 E2E，避免自动调用注册接口污染生产数据
- Render 后端需重新部署后，线上才会使用本地最新的 DoubaoAdapter 真实返回解析修复
- 线上写入型 E2E 仍建议人工使用一次性邮箱执行，避免自动测试污染生产数据库

## 详细测试结果

### 1. 前端测试
```powershell
pnpm --filter frontend test
```

结果：
```text
Test Files  15 passed (15)
Tests       153 passed (153)
```

新增覆盖：
- `validation.test.ts`：邮箱、密码长度、昵称长度边界
- `auth.pages.test.tsx`：登录/注册非法输入本地拦截，不调用 store action
- `page-experience.test.tsx`：图书搜索 fallback warning、脚本保存 warning、流水线启动错误提示

### 2. 后端测试
```powershell
pnpm --filter backend test
```

结果：
```text
Test Suites: 3 skipped, 9 passed, 9 of 12 total
Tests:       14 skipped, 45 passed, 59 total
```

新增覆盖：
- `script-adapter.spec.ts`：对象式 `segments` 真实模型返回解析
- `script-adapter.spec.ts`：首次 malformed JSON 后使用严格 JSON prompt 重试，不直接退回 mock

### 3. 前端构建
```powershell
pnpm --filter frontend build
```

结果：
```text
tsc -b && vite build
✓ built
```

### 4. 线上只读 API
```powershell
Invoke-RestMethod -Uri "https://podcast-platform-backend-8065.onrender.com/api/health"
Invoke-RestMethod -Uri "https://podcast-platform-backend-8065.onrender.com/api/bgm/tracks"
```

结果：
- `/api/health`：`code: 0`
- `/api/bgm/tracks`：`code: 0`，返回 12 条 BGM 曲目

### 5. 后端构建
```powershell
pnpm --filter backend build
```

结果：
```text
nest build
```

### 6. 后端 E2E
```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/podcast'
$env:ALLOW_LOCAL_DB_E2E='1'
$env:LOCAL_FULL_E2E='1'
pnpm --filter backend test:e2e
```

结果：
```text
Test Suites: 3 passed, 3 total
Tests:       14 passed, 14 total
```

覆盖：
- 注册/登录/`/auth/me`
- 游客草稿登录后 `sync`
- 用户偏好 GET/PATCH
- 项目创建、生成、取消、重新生成、分享、列表、删除
- pipeline mock E2E 与 auth E2E

本地写入保护：
- 强制 `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/podcast`
- `ALLOW_LOCAL_DB_E2E=1` 与 `LOCAL_FULL_E2E=1` 双开关
- 测试前拒绝非 localhost 数据库，避免写入 Neon/生产库

### 7. 大模型真实链路

执行方式：临时 `ts-node` smoke 调用 `DoubaoAdapter.generateScript`，读取本地 `.env` 的模型配置但不输出密钥。

结果：
- 返回段落数：24
- stage：`intro`、`introduce`、`interpret`、`review`、`suggest`、`closing`
- 未出现 `falling back to mock`

本轮修复：
- 提示词从“JSON 数组”统一为 `{"segments":[...]}`，与 `response_format: { type: "json_object" }` 对齐
- 首次 JSON 解析失败时，使用更严格的 JSON-only prompt 低温重试

### 8. 线上页面 smoke

目标：`https://podcast-platform-seven.vercel.app`

结果：
- `/`、`/book-search`、`/projects/new`、`/login`、`/register` 均返回 200
- 未发现 `/api/api/`
- 未发现缺少 `/api` 的后端直连请求
- 无 API 4xx/5xx response、无 Console error

### 9. 自动化脚本
```powershell
powershell -ExecutionPolicy Bypass -File scripts\e2e-online.ps1
```

结果：
- Render 只读 smoke checks 通过
- 输出线上 E2E 人工检查清单

新增脚本：
- `scripts/verify-deploy.ps1`：本地测试/构建、线上只读检查、可选 Vercel 无缓存生产部署尝试
- `scripts/e2e-online.ps1`：线上只读检查与人工 E2E 清单

## 当前结论

1. 前端测试环境问题已解决，不再有 29 个 localStorage 失败。
2. BGM API 500 已不复现，当前线上只读验证正常。
3. `/api/api/` 本轮线上 smoke 未复现；若后续再次出现，优先检查 Vercel 旧构建缓存或环境变量构建值。
4. 大模型接口已连通，真实返回可解析为脚本段落；本地后端已修复此前 malformed JSON 导致 fallback 的风险。
5. 完整本地写入型 E2E 已在本机 Postgres/Redis/MinIO 环境通过，测试后本地 DB 已清理为 `users=0`、`projects=0`、`shareLinks=0`、`preferences=0`、`bgmTracks=12`。
6. 用户注册接口不做线上自动探测；请人工使用一次性测试邮箱做生产 E2E。
7. Vercel 生产前端已使用同源 `/api` 代理部署；线上完整生成能力需等 Render 后端重新部署最新解析修复后再做受控写入 E2E。

## Redeploy 后线上测试（2026-06-14 20:02）

### 已确认
- 最新 Vercel 生产域名：`https://podcast-platform-seven.vercel.app`
- 旧域名 `https://podcast-platform.vercel.app` 返回 Vercel `MIDDLEWARE_INVOCATION_FAILED`，不是当前最新生产部署
- 最新生产域名页面可打开：`/`、`/login`、`/register`、`/book-search`、`/projects/new` 均返回 200
- Network 中未发现 `/api/api/`
- 后端只读接口仍正常：`/api/health` 与 `/api/bgm/tracks` 返回 `code: 0`

### 新发现阻塞
- 最新线上前端请求后端时少了 `/api`，例如请求 `https://podcast-platform-backend-8065.onrender.com/bgm/tracks`
- Render CORS 当前未允许 `https://podcast-platform-seven.vercel.app`，浏览器报：`No 'Access-Control-Allow-Origin' header`
- 本地已修复 `frontend/src/constants/env.ts`，现在会把 `VITE_API_BASE_URL` 自动归一化为单个 `/api`
- 修复后本地验证：`pnpm --filter frontend test` 153 passed；`pnpm --filter frontend build` 通过

### 需要部署配置
- Vercel 可继续设置 `VITE_API_BASE_URL=https://podcast-platform-backend-8065.onrender.com`，代码会自动补 `/api`
- Render `CORS_ORIGINS` 需包含：`https://podcast-platform-seven.vercel.app`
- 如仍使用旧自定义/别名域名，也需一并加入 `CORS_ORIGINS`

## 本地生成与线上更新验证（2026-06-14 20:16）

### 本地生成播客
- 执行方式：直接调用 mock `PipelineService.runFullPipeline`，不写生产数据库
- ISBN：`9787121362200`
- 结果：`status=success`
- Run ID：`ac363a4c-3f73-4f2c-9e21-fec11e480e0c`
- 本地 MP3：`backend/tmp/exports/ac363a4c-3f73-4f2c-9e21-fec11e480e0c.mp3`
- 文件大小：`100354` bytes
- 产物：`01-metadata.json`、`02-script.json`、`03-mixed.mp3`、`04-exported.mp3`
- 进度事件：21 条，最终进度 100%

### 线上部署
- 部署命令：`vercel deploy frontend --prod --force --yes --project podcast-platform --build-env VITE_API_BASE_URL=/api`
- 最新生产别名：`https://podcast-platform-seven.vercel.app`
- 最新部署：`https://podcast-platform-2wjx7k09k-gongyijie85s-projects.vercel.app`
- Vercel `/api/*` 代理已生效，避免跨域依赖 Render `CORS_ORIGINS`

### 线上复测
- `https://podcast-platform-seven.vercel.app/api/health`：`code: 0`
- `https://podcast-platform-seven.vercel.app/api/bgm/tracks`：返回 12 条
- 页面：`/`、`/book-search`、`/projects/new` 均 200
- Network：未发现 `/api/api/`
- Network：未发现缺少 `/api` 的后端直连请求
- Console：无错误
- 访客首页不再显示 `Missing bearer token`

## Vercel 部署验证步骤

1. 打开 Vercel → `podcast-platform` → **Settings → Environment Variables**。
2. 当前同源代理部署建议确认 `VITE_API_BASE_URL=/api`。
3. 如改为直连 Render，确认 `VITE_API_BASE_URL=https://podcast-platform-backend-8065.onrender.com` 且末尾没有 `/api`。
4. 打开 **Deployments**，选择最新 deployment → **Redeploy**。
5. 取消勾选 **Use existing Build Cache**。
6. 等待 Ready。
7. 用无痕窗口打开线上前端。
8. F12 → Network，确认项目请求 URL 不包含 `/api/api/`。
