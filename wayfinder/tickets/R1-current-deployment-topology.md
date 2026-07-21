# R1 — 确认当前线上部署拓扑与数据存储

> 类型：research / AFK
> 状态：✅ 已完成
> 标签：`wayfinder:research`

## Question

当前 Podcast 和主应用 BookRank 实际如何部署，迁移时哪些入口、数据和服务必须保留？

## Resolution

- `render.yaml` 只声明了 `podcast-platform-backend` 一个 Render Docker Web Service：从 `main` 自动部署，镜像入口为 `backend/Dockerfile`，健康检查为 `/api/health`，端口 3001。
- `https://podcast-platform-backend-8065.onrender.com/api/health` 当前返回 `503`；Render 截图显示这是工作区 750 小时耗尽后的暂停状态。
- `https://bookrank-ckml.onrender.com/` 和 `/api/health` 当前也返回 `503`，说明 BookRank 仍在 Render 且被同一工作区额度暂停；迁移 Podcast 的目标是释放并保住 BookRank，不是删除 BookRank。
- `https://podcast-platform-cn-free.pages.dev/` 当前页面返回 `200`，但 `/api/health` 返回 `503`；Cloudflare Pages Functions 的 `BACKEND_URL` 仍指向 Render。
- Vercel 项目仍是 `https://podcast-platform-seven.vercel.app`，仓库中没有 Vercel 部署配置；它不应继续作为中国大陆主入口。
- 仓库没有证明 Render 生产环境是否有独立 Postgres、Redis、MinIO；必须从 Render Environment / Databases 页面确认。音频和封面对象不能只靠数据库迁移推断。
- 现有 `fly.toml` 的 `PORT=3000` 与 `internal_port=3001` 不一致，且 Fly.io 新账号的永久免费假设已失效；F1/F4 应改为 Koyeb Free 路线。
- 本地 `.env` 已指向 Neon 新加坡数据库；只读检查得到 `6 users`、`12 projects`、`240 book_library_items`、`97 audio_files`，不是空库。
- Prisma 状态显示仅 `20260708000000_book_enrichment` 尚未应用；该 migration 只是给 `book_library_items` 增加两个可空字段。
- 本地 `backend/storage` 有 12/12 条 BGM 文件和 72/97 条音频文件，25 条音频记录对应的文件缺失；不能把本地目录当作完整生产对象存储备份。
