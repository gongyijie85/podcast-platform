# 播客平台交接文档

## 项目概述
AI 播客制作平台：用户输入 ISBN → AI 生成脚本 → TTS 合成 → 导出 MP3。

## 技术栈
- **前端**：Vite + React + MUI + Tailwind CSS
- **后端**：NestJS + Prisma + PostgreSQL (Neon)
- **部署**：Vercel (前端) + Render (后端)
- **AI**：小米 mimo 模型 (脚本生成，OpenAI 兼容格式)
- **数据库**：Neon PostgreSQL (免费版)

## 当前状态

### ✅ 已完成
1. 后端单元测试：45 pass，14 skipped
2. 前端测试：153 pass
3. 前端生产构建：通过
4. 后端健康检查：`https://podcast-platform-backend-8065.onrender.com/api/health` ✅
5. BGM 曲库接口：`https://podcast-platform-backend-8065.onrender.com/api/bgm/tracks` ✅
6. Vitest `localStorage` 环境问题已修复
7. 前端登录/注册表单增加本地校验
8. 图书搜索和项目生成失败提示已增强
9. API base URL 已防御性移除末尾 `/api`
10. 项目 sync/cancel/regenerate/share 后端接口已补齐
11. 用户偏好 GET/PATCH、最近 BGM/字幕样式持久化已补齐
12. 分享试听页、脚本模板、环境音可关闭配置、封面 fallback 已补齐
13. 新增 `scripts/verify-deploy.ps1` 与 `scripts/e2e-online.ps1`
14. Doubao/Mimo 大模型真实链路已验证，返回 24 个脚本段落且未进入 mock fallback
15. DoubaoAdapter 已统一 JSON object 提示词并增加严格 JSON 重试，降低 malformed JSON 导致 fallback 的风险
16. 本地 Postgres/Redis/MinIO 写入型 E2E 已通过，覆盖注册、登录、游客项目 sync、偏好、项目生成、取消、重新生成、分享和删除

### ⚠️ 待人工处理
**Render 后端部署和线上 E2E 验证**

当前判断：
- 本地代码已经避免把 `/api` 叠加成 `/api/api/`。
- 本轮线上 smoke 未复现 `/api/api/projects`；如果后续再次出现，优先检查 Vercel 旧构建缓存或 `VITE_API_BASE_URL` 构建值。
- 不建议自动调用线上注册接口，避免污染生产数据库。
- Vercel 生产前端已更新为同源 `/api` 代理，线上只读与页面 smoke 正常。
- Render 后端需要重新部署，线上才会包含本地最新的 DoubaoAdapter 解析修复和新增后端接口。
- 线上写入型 E2E 需在 Render 后端部署后，用一次性测试账号人工执行。

## 部署检查

### Redeploy 后当前线上状态
- 最新 Vercel 生产域名是 `https://podcast-platform-seven.vercel.app`
- `https://podcast-platform.vercel.app` 当前返回 Vercel `MIDDLEWARE_INVOCATION_FAILED`
- 最新域名页面可打开，Vercel `/api/*` 代理已部署
- `VITE_API_BASE_URL=/api` 构建已上线，前端不再直连 Render，避免 CORS 阻塞
- 本地已修复 API base URL 归一化：`frontend/src/constants/env.ts`
- 访客首页不再触发 `Missing bearer token`

### Vercel 手动重新部署
1. 打开 https://vercel.com → `podcast-platform`
2. 进入 **Settings → Environment Variables**
3. 当前同源代理部署建议确认 `VITE_API_BASE_URL` 为：
   ```text
   /api
   ```
   如改为直连 Render，则使用：
   ```text
   https://podcast-platform-backend-8065.onrender.com
   ```
4. 直连 Render 时确认末尾不要带 `/api`
5. 进入 **Deployments**
6. 最新部署 → **...** → **Redeploy**
7. 取消勾选 **Use existing Build Cache**
8. 点击 **Redeploy**，等待 Ready

### Render 后端只读验证
```powershell
Invoke-RestMethod -Uri "https://podcast-platform-backend-8065.onrender.com/api/health"
Invoke-RestMethod -Uri "https://podcast-platform-backend-8065.onrender.com/api/bgm/tracks"
```

期望：两个接口均返回 `code: 0`。

### Render CORS 更新
在 Render 后端服务环境变量中确认：
```text
CORS_ORIGINS=https://podcast-platform-seven.vercel.app,http://localhost:5173
```

如果还绑定其他 Vercel alias 或自定义域名，用英文逗号追加。

备注：当前前端已通过 Vercel `/api/*` 代理访问后端；更新 Render CORS 仍建议保留，但不是当前线上前端的阻塞项。

## 本地验证命令

```powershell
cd D:\Broadcast\podcast-platform
pnpm --filter frontend test
pnpm --filter backend test
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/podcast'
$env:ALLOW_LOCAL_DB_E2E='1'
$env:LOCAL_FULL_E2E='1'
pnpm --filter backend test:e2e
pnpm --filter frontend build
pnpm --filter backend build
powershell -ExecutionPolicy Bypass -File scripts\e2e-online.ps1
```

当前已验证：
- 前端：15 个测试文件通过，153 个测试通过
- 后端：9 个测试套件通过，3 个跳过；45 个测试通过，14 个跳过
- 后端 E2E：本地 Postgres/Redis/MinIO 环境下 3 个测试套件通过，14 个测试通过
- 前端构建：通过
- 后端构建：通过
- 线上只读脚本：`/api/health` 与 `/api/bgm/tracks` 通过
- 线上页面 smoke：`/`、`/book-search`、`/projects/new`、`/login`、`/register` 均 200；无 `/api/api/`、无 Console error
- 真实模型 smoke：24 个 segments，6 个 stage，未进入 mock fallback
- 本地 DB 清理后计数：`users=0`、`projects=0`、`shareLinks=0`、`preferences=0`、`bgmTracks=12`

## 数据库变更

- 新增 Prisma migration：`backend/prisma/migrations/20260614064000_share_links_and_cover/migration.sql`
- 新增 `ShareLink`，新增 `Project.coverUrl`
- 部署后端前需在目标数据库执行 Prisma migration，并重新生成 Prisma Client

## 线上 E2E 验证清单

| 步骤 | 操作 | 期望结果 |
|------|------|---------|
| 1 | 无痕窗口打开前端 | 看到登录页 |
| 2 | F12 → Network | 后续请求 URL 不含 `/api/api/` |
| 3 | 使用一次性邮箱注册 | 注册成功并进入仪表盘 |
| 4 | 登录 | 进入 Dashboard |
| 5 | 新建项目 → 输入 ISBN | 可进入配置流程 |
| 6 | 填脚本、选音色和 BGM | 可启动生成 |
| 7 | 查看项目详情 | 可看到生成状态或明确失败提示 |
| 8 | 如生成完成，下载 MP3 | 文件可下载和播放 |
| 9 | 项目详情生成分享链接 | 打开 `/share/:token` 可进入只读试听页 |
| 10 | 注册/登录后检查草稿 | 游客项目 ID 会尝试 sync 到当前用户 |

## 环境变量

### 后端 (Render)
- `DATABASE_URL`：Neon PostgreSQL 连接字符串
- `JWT_SECRET`：生产强随机值
- `CORS_ORIGINS`：Vercel 前端域名

### 前端 (Vercel)
- `VITE_API_BASE_URL`：当前同源代理部署使用 `/api`；直连 Render 时使用 `https://podcast-platform-backend-8065.onrender.com`

## 已知限制
1. Render free tier 冷启动需要 30s+
2. Pipeline 只能在 dev 模式跑，生产环境可能返回 `70006`
3. Render ephemeral FS：导出的 MP3 重启后丢失
4. TTS 使用 mock 模式，Volcengine API Key 未配置
5. 本机 Redis 版本为 5.0.14.1，低于部分 BullMQ 生产建议版本；当前本地 E2E 未受影响

## 联系信息
- GitHub: https://github.com/gongyijie85/podcast-platform
- 后端: `https://podcast-platform-backend-8065.onrender.com`
