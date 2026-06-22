# 部署指南（Vercel + Render 免费方案）

**预计时间**：30~60 分钟
**前置条件**：GitHub 账号、邮箱（注册 Vercel + Render）

> 本指南面向免费方案：Vercel Hobby tier + Render Free tier，零成本把 ISBN → AI Podcast 平台跑上线。

## 1. 推送代码

```bash
# 确保 backend/Dockerfile / render.yaml / vercel.json / docs/deploy.md 等都已 commit
cd D:\Broadcast\podcast-platform
git config core.autocrlf false  # 避免 Windows CRLF 告警
git add -A
git commit -m "feat(deploy): Vercel + Render free-tier config"
git push origin main
```

## 2. 部署 frontend 到 Vercel

1. 访问 <https://vercel.com> 注册（推荐用 GitHub 登录）
2. **Add New → Project** → 选 `gongyijie85/podcast-platform` 仓库
3. **Root Directory** 设为 `frontend`（关键）
4. **Build Command** 留默认 `pnpm build`
5. **Output Directory** 留默认 `dist`
6. **Environment Variables**：先加一条 `VITE_API_BASE_URL`，值**先空着**（等第 3 步拿到 backend URL 再回来填）
7. 点 **Deploy** → 等 1~2 分钟 → 拿到 `https://<你的项目名>.vercel.app`

> 提示：第一次部署会跑 `pnpm install` + `pnpm build`，大约 60~90 秒。

## 3. 部署 backend 到 Render

1. 访问 <https://render.com> 注册（推荐用 GitHub 登录）
2. **New + → Web Service**
3. 选 `gongyijie85/podcast-platform` 仓库
4. **Runtime** 选 `Docker`
5. **Dockerfile Path**：`backend/Dockerfile`
6. **Docker Context**：`.`（项目根，重要）
7. **Instance Type**：Free
8. **Health Check Path**：`/api/health`
9. **Environment Variables**（关键 4 个）：
   - `NODE_ENV` = `production`
   - `PORT` = `3001`
   - `CORS_ORIGINS` = `https://<你的>.vercel.app,http://localhost:5173`
   - `JWT_SECRET` = 点 **Generate Value**（Render 自动生成 32+ 字符）
   - `DATABASE_URL` = 你的 PostgreSQL 连接串
   - `LLM_PROVIDER` = `mimo`
   - `LLM_API_KEY` = Token Plan / Xiaomi MiMo key
   - `LLM_ENDPOINT` = `https://token-plan-sgp.xiaomimimo.com/v1`
   - `LLM_MODEL` = `mimo-v2.5-pro`
   - `BOOKRANK_API_BASE_URL` = `https://bookrank-ckml.onrender.com`
10. 点 **Create Web Service** → 等 5~10 分钟构建 → 拿到 `https://<xxx>.onrender.com`

> ⚠️ **第一次构建要 5~10 分钟**，因为要从头 `pnpm install` 全部依赖（node_modules 缓存层命中后第二次 < 2 分钟）。

## 4. 回到 Vercel 配 `VITE_API_BASE_URL`

1. 进 Vercel 项目 → **Settings → Environment Variables**
2. 把 `VITE_API_BASE_URL` 的值改成 Render 给的 URL，例如 `https://podcast-platform-backend.onrender.com`
   - `VITE_WS_URL` = `wss://<你的后端>.onrender.com`
   - `VITE_API_TIMEOUT_MS` = `90000`（Render Free 冷启动时给首个 API 请求更长等待窗口）
3. 切到 **Deployments** → 选最新一次 → **Redeploy**（env 改了必须重新构建才能生效）
4. 完成后访问 `https://<你的>.vercel.app`，F12 console 应看到 `/api/health` 调用 200

## 5. 5 分钟验证清单

- [ ] 打开 `https://<你的>.vercel.app` → 看到登录页
- [ ] F12 console 无 CORS 报错
- [ ] 输入 ISBN 走通 4 步（选书→配置→生成→导出）
- [ ] 下载 MP3 成功
- [ ] `curl https://<xxx>.onrender.com/api/health` 返 `{"status":"ok",...}`

## 常见问题（FAQ）

### Cold start 30s+

Render free tier 15 分钟无活动后休眠，下次访问需要 30 秒冷启动。
**前端加 loading state**：登录页 + 主流程页面要有"唤醒中…"loading，
时间 < 30s 用户基本能接受；超过 60s 再提示刷新。

想降低冷启动频率，可以用 UptimeRobot、cron-job.org 或 GitHub Actions 每 10 分钟请求一次：

```text
https://<xxx>.onrender.com/api/health
```

但免费版平台策略可能变化，这种 keep-alive 只能降低休眠概率，不能保证生产级 SLA；真实业务高频测试建议升级到 Render Starter 或其他不休眠实例。

### 导出文件 24h 后失效

Render free tier 文件系统是 ephemeral（重启即清空）。导出的 MP3 需在 24h 内下载。
v1.1 PRD §INCR-04 设计：导出后 24h 内可重复下载，超时则从 OSS 重新生成。
**当前 v1.0**：导完立刻下载一次。

### Docker build 失败

在 Render dashboard → **Logs** 看具体报错。常见原因：

- **pnpm 版本不对**：项目 pin `9.9.0`，Dockerfile 已 `corepack prepare pnpm@9.9.0 --activate`
- **网络拉镜像失败**：Render 自动重试 3 次
- **超出 15 分钟构建限制**：Free tier 单次 build < 15 min。本项目实测 5~10 分钟

### CORS 跨域

后端 env 配 `CORS_ORIGINS=<vercel-url>`，多个用逗号分隔。
**不要**用 `*`（v1.1 PRD §NFR-01 严格要求白名单）。

### 端口 3001 没监听

`PORT` env 必须是 `3001`（Dockerfile 写死）。Render 默认会注入 `PORT=10000`，
**必须**在 Environment Variables 里覆盖为 `3001`，否则 Express 找不到端口。

### WebSocket 连不上

`VITE_WS_URL` 也要配：值 = `wss://<xxx>.onrender.com`（注意是 `wss://` 不是 `ws://`）。
Render free tier WebSocket 同样会冷启动，首连 30s+。

## 6. 成本与限制

| 项目 | 免费额度 | 本项目用量 |
|------|----------|------------|
| Vercel Hobby | 100 GB bandwidth/month | < 1 GB |
| Render Free | 750 hr/month, 512 MB RAM, 0.1 CPU | 24×7 = 720 hr，刚好 |
| Render Free | 15 min sleep | cold start 30s |
| 磁盘 | ephemeral（重启清空） | 24h 内下载导出文件 |

**预估月成本**：$0（仅 1 个 backend 实例 + 1 个 frontend 站点）

## 7. 升级路径（超出免费额度时）

| 触发条件 | 建议升级 |
|----------|----------|
| 24h 持续访问 / cold start 太频繁 | Render Starter $7/月（无 sleep） |
| 月活 > 10k | Vercel Pro $20/月 + Render Standard $25/月 |
| 媒体文件需长期保留 | 加阿里云 OSS（v1.1 已配 STORAGE_DRIVER=oss） |

---

**Q&A 不够？** 看 `backend/.env.example` 注释 + `docs/architecture.md` 第五章（部署拓扑）。
