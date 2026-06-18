# AI 播客质量闭环与部署交付文档

更新时间：2026-06-18

## 1. 当前结论

本轮已把产品从“能自动生成播客”推进到“生成前有节目策划、生成后有质量自检、可快速返修”的质量闭环版本。当前主链路仍然是：

`图书陈列库 / BookRank 导入 -> 批量选书 -> 新建项目 -> Xiaomi MiMo / Token Plan 生成脚本 -> Xiaomi MiMo TTS -> BGM 混音 -> 导出 TXT/PDF/MP3/ZIP`

本轮不接 Doubao API。豆包、NotebookLM、ElevenLabs GenFM、Wondercraft 只作为产品体验参考；当前 LLM 与 TTS 命名统一为 **Xiaomi MiMo / Token Plan**。

## 2. 本轮已完成能力

- `/projects/new` 默认脚本模板改为 `audio-overview`，即“AI 深潜播客”。
- 后端 LLM 生成返回从裸 `segments` 升级为 `{ segments, episodeBrief }`。
- `ScriptDto` 新增 `episodeBrief` 与 `qualityReport`，存储在 `Script.content` 的 JSON envelope 中，不新增数据库迁移。
- 新增确定性质量分析器，检查：
  - 每本书是否被覆盖
  - 是否有足够具体的讨论台词
  - 多书节目是否有跨书比较
  - 口头禅/空话密度
  - 书名是否疑似遗漏或改写
  - 缺少真实简介导致的事实边界风险
- 项目详情页的“脚本”页签新增：
  - 节目策划 brief
  - 质量自检报告
  - 快速返修按钮：更深入、少口头禅、更轻松、缩短到 8 分钟、加强跨书比较
  - 自定义返修指令
- `POST /projects/:id/regenerate` 支持 `{ scriptTemplate, revisionPreset, customInstruction }`。
- 旧 pipeline 层兼容新旧 LLM adapter 返回形状，避免历史测试和 fixture 流程断裂。

## 3. 本地验收结果

已执行并通过：

```bash
pnpm exec jest --config jest.config.ts --runInBand
# backend：14 passed, 3 skipped, 74 tests passed

pnpm --filter frontend test
# frontend：15 files passed, 160 tests passed

pnpm --filter backend build
# Nest build passed

pnpm --filter frontend build
# tsc -b && vite build passed
```

浏览器轻验收：

- `http://localhost:3001/api/health` 返回 200 与 `{ status: "ok" }`。
- `http://localhost:5173/projects/new?bookId=9780593804216&bookId=9780063511637` 返回 200。
- 新建页第一步显示两本 BookRank 图书、真实中文简介、榜单信息与来源。
- 新建页第二步显示“AI 深潜播客”“专业导读”和 BGM 模板。

建议同事上线前再做一次完整人工 smoke test：

1. 打开 `/book-search`。
2. 从 BookRank 导入或选择两本书。
3. 批量勾选进入 `/projects/new`。
4. 确认默认模板是“AI 深潜播客”。
5. 开始生成。
6. 到项目详情页检查“节目策划”“质量自检”“快速返修”是否出现。
7. 下载 TXT、PDF、MP3、ZIP。

## 4. 部署总体方案

推荐：

- Frontend：Vercel Hobby
- Backend：Render Free Web Service
- Database：真实业务测试不要使用 Render Free Postgres 超过 30 天；建议 Neon / Supabase / Render paid Postgres
- Redis：Upstash / Render Key Value / 其他托管 Redis
- 文件存储：真实业务测试建议 OSS/S3；Render 免费实例本地文件系统会丢失

免费版目标是“可真实业务测试”，不是生产级高可用。

## 5. Render 后端部署步骤

仓库根目录已有 `render.yaml`，后端使用 Docker：

- Dockerfile：`backend/Dockerfile`
- Docker Context：`.`
- Health Check Path：`/api/health`
- Render Service Type：Web Service
- Runtime：Docker

Render 环境变量：

```env
NODE_ENV=production
PORT=3001
CORS_ORIGINS=https://<your-frontend>.vercel.app,http://localhost:5173
JWT_SECRET=<32+ chars random secret>

DATABASE_URL=<production postgres url>
REDIS_HOST=<redis host>
REDIS_PORT=<redis port>
REDIS_PASSWORD=<redis password if any>

LLM_PROVIDER=mimo
LLM_API_KEY=<Token Plan / Xiaomi MiMo key>
LLM_ENDPOINT=https://token-plan-sgp.xiaomimimo.com/v1
LLM_MODEL=mimo-v2.5-pro
LLM_MAX_COMPLETION_TOKENS=4096
LLM_TOP_P=0.9

MIMO_TTS_API_KEY=<empty to reuse LLM_API_KEY, or set separately>
MIMO_TTS_ENDPOINT=https://token-plan-sgp.xiaomimimo.com/v1
MIMO_TTS_MODEL=mimo-v2.5-tts
MIMO_TTS_FORMAT=wav

OPENLIBRARY_BASE=https://openlibrary.org
GOOGLE_BOOKS_BASE=https://www.googleapis.com/books/v1
GOOGLE_API_KEY=<optional>
BOOKRANK_API_BASE_URL=https://bookrank-ckml.onrender.com

MAX_BOOKS_PER_PROJECT=20
PDF_FONT_PATH=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
```

存储变量二选一：

```env
# 简单 smoke test 可用，但不建议真实业务长期使用
STORAGE_DRIVER=local
```

或：

```env
# 推荐真实业务测试
STORAGE_DRIVER=oss
OSS_ACCESS_KEY=<oss access key>
OSS_SECRET_KEY=<oss secret>
OSS_BUCKET=<bucket>
OSS_REGION=<region>
OSS_CDN_DOMAIN=<optional cdn domain>
```

数据库迁移：

- 当前 Docker 启动命令不会自动执行 `prisma migrate deploy`。
- 首次部署或有新 migration 时，需要同事在部署环境执行：

```bash
pnpm --filter backend prisma:deploy
```

如果 Render Shell 不可用，可在本地临时设置生产 `DATABASE_URL` 后执行同一命令。注意不要把生产数据库连接串提交到仓库。

## 6. Vercel 前端部署步骤

Vercel 项目设置：

- Root Directory：`frontend`
- Framework：Vite
- Build Command：`pnpm build`
- Output Directory：`dist`

Vercel 环境变量：

```env
VITE_API_BASE_URL=https://<your-backend>.onrender.com
VITE_WS_URL=wss://<your-backend>.onrender.com
VITE_DEFAULT_LANG=zh-CN
VITE_MAX_BOOKS=20
```

重要提醒：

- Vercel 环境变量变更后必须重新部署，旧 deployment 不会自动拿到新变量。
- `frontend/vercel.json` 目前有一条 `/api/(.*)` rewrite，指向一个已有 Render URL。换成同事自己的后端域名，或移除 rewrite 并完全依赖 `VITE_API_BASE_URL`。
- 后端 `CORS_ORIGINS` 必须包含 Vercel 域名，否则浏览器会报 CORS。

## 7. 免费版限制与规避

Render Free：

- Free Web Service 会在约 15 分钟无入站流量后休眠，下次请求会冷启动，可能需要约 1 分钟。
- Free instance hours 有月度限制，耗尽后会暂停到下月。
- Free Postgres 固定 1GB，创建后 30 天过期，并有升级宽限期；真实业务测试建议使用持久数据库。
- Render 免费实例本地文件系统是 ephemeral，服务重启或重新部署后生成的音频/PDF 可能丢失。

降低冷启动影响：

- 用 UptimeRobot 或 cron-job.org 每 10 分钟访问：

```text
https://<your-backend>.onrender.com/api/health
```

这只能降低冷启动概率，不能保证 SLA。要稳定不休眠，升级 Render paid instance 或换不休眠后端平台。

## 8. 线上 smoke test

部署后执行：

```bash
curl https://<your-backend>.onrender.com/api/health
```

浏览器检查：

1. 打开 Vercel 前端首页。
2. 打开开发者工具，确认无 CORS 报错。
3. 访问 `/book-search`，导入 BookRank 图书。
4. 勾选两本书进入 `/projects/new`。
5. 确认默认“AI 深潜播客”。
6. 开始生成，观察进度是否到脚本、TTS、字幕、合成。
7. 进入项目详情页，检查节目策划与质量自检。
8. 下载 TXT/PDF/MP3/ZIP。
9. 点击“少口头禅”或“加强跨书比较”返修，确认项目重新进入生成中。

## 9. 回滚与排障

常见问题：

- 页面能打开但 API 失败：检查 `VITE_API_BASE_URL` 和 `CORS_ORIGINS`。
- WebSocket 失败：检查 `VITE_WS_URL=wss://...`，不要用 `ws://`。
- PDF 中文乱码：确认 Docker 镜像包含 `fonts-noto-cjk`，并设置 `PDF_FONT_PATH`。
- 脚本变 mock：检查 Render 是否设置 `LLM_API_KEY`。
- TTS 是静音或 mock：检查 `MIMO_TTS_API_KEY` 或 `LLM_API_KEY`。
- BookRank 导入失败：检查 `BOOKRANK_API_BASE_URL` 和后端网络。
- 导出音频消失：不要用免费实例本地文件存储承载真实业务；切换 OSS/S3。

安全要求：

- 不要把 `LLM_API_KEY`、数据库连接串、JWT_SECRET、OSS 密钥写入 git。
- 不要在日志中打印完整 API key。
- 同事执行部署时，用平台环境变量或密钥管理工具配置。

## 10. 参考资料

- Render Free / 免费限制：`https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026`
- Render 环境变量：`https://render.com/docs/configure-environment-variables`
- Render Health Checks：`https://render.com/docs/health-checks`
- Vercel 环境变量：`https://vercel.com/docs/environment-variables`
- Vercel 环境变量管理：`https://vercel.com/docs/environment-variables/managing-environment-variables`
- 项目已有部署指南：`docs/deploy.md`
