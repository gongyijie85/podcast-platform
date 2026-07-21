# Wayfinder Map — Podcast 后端迁出 Render，保住 BookRank

> 标签 `wayfinder:map` · 2026-07-21 校正（Render 工作区额度耗尽；BookRank 必须保留）

## Destination

**把 podcast-platform 后端从 Render Free 迁出，保留 BookRank 在 Render；公开入口使用已部署的 Cloudflare Pages，后端落到 Northflank Developer Sandbox + 现有 Neon + Redis addon。**

**为什么必须迁**：用户有另一个应用也在 Render，750h/月账户额度被 podcast-platform 占满，**影响其他应用**。

**成本目标**：
- Northflank Developer Sandbox（当前项目为 London；免费额度但创建资源前需绑定支付方式）
- 现有 Neon Free（Postgres，尚未完成 Render 生产库身份核对）
- Northflank Redis addon（London，已运行）
- Backblaze B2 Free（对象存储，尚未配置）
- Fly.io 只作为已有 Legacy Free 账号的备选，不再假设新账号永久免费

具体标志：
1. Northflank service `/api/health` 200
2. Cloudflare Pages `https://podcast-platform-cn-free.pages.dev` 页面 200，前端直连 Northflank API
3. 用一次性邮箱完成 10 步线上 E2E，无错误
4. v0.6.4 主播口播稿新生成全中文
5. v0.6.3 中文翻译字段可见
6. Podcast Render 服务不再消耗额度；BookRank 保留在 Render

## Notes

- 域名：全栈 Web 平台（Vite+React+NestJS+PostgreSQL）
- 站立偏好：中文为主；pnpm 9；本地 mock 兜底；游客项目不污染生产
- **不动** codex/move-live-pitch-section 上未提交的 v0.7.0 雏形
- **关键发现**：backend **不需要改任何业务代码**——
  - `DATABASE_URL` 环境变量已支持外部 Postgres
  - `REDIS_URL` 已支持 Upstash（`rediss://` 自动开 TLS）
  - `MINIO_*` 已支持 S3 兼容端点（MinIO npm 客户端 = S3 协议）

## Decisions so far

- 2026-07-20 · [确认当前线上部署拓扑与数据存储](tickets/R1-current-deployment-topology.md) — Podcast 与 BookRank 都由 Render 工作区额度暂停；Cloudflare 页面可达但 API 上游仍是 Render

- 2026-07-16 · 原定 Fly.io 外部服务栈；2026-07-20 因新账号无永久免费额度而被 Koyeb 路线取代
- 2026-07-20 · Vercel 不是大陆主入口；Cloudflare Pages 作为公开入口
- 2026-07-20 · Fly.io 新账号无永久免费额度；改为优先评估 Koyeb Free
- 2026-07-21 · Koyeb 账号已登录，但控制面依赖的 `glb-rl-infra.infra.prod.koyeb.com` 返回 NXDOMAIN；等待平台 DNS/控制面恢复后再创建服务
- 2026-07-21 · Fly 备用账号仅有个人组织且 `EnablePaidHobby=false`，没有现成 App；不假设新账号免费，也不在未确认计费前部署
- 2026-07-21 · Northflank 已创建免费项目 `podcast-platform`（London），GitHub 仅授权 `gongyijie85/podcast-platform`；创建第一个服务时要求添加支付方式，服务尚未创建
- 2026-07-21 · Northflank 已创建 `podcast-platform-backend`（London）和 `nf-redis` addon；后端 `/api/health`、`/api/bgm/tracks`、Socket.IO polling 均 200。Asia Southeast/Jurong West 需要按量付费新建项目，现项目区域不可变
- 2026-07-21 · Cloudflare Pages 已切换为静态入口直连 Northflank；Pages Function 反代对 `code.run` 上游返回 1101，因此真实前端不再依赖该反代
- 2026-07-21 · 本机 Railway CLI 已登录，但仅关联现有 `xhs-content-lab` 项目；Railway 新项目属于一次性试用/计费路线，未在未确认成本前创建
- 2026-07-16 · Oracle / HF Spaces / Hetzner 全部作废
- 2026-07-16 · 已写好：fly.toml、backend/Dockerfile.fly、.env.fly.example、scripts/deploy-fly.sh、scripts/setup-fly-secrets.sh、docs/fly-deploy.md

## Not yet specified

- Render 生产环境实际是否配置独立 Postgres、Redis、MinIO，仓库文件无法确认
- Render 生产环境是否复用现有 Neon；若不是，必须先导出到新 Neon 分支/库，禁止直接覆盖现有 Neon
- 25 条缺失音频对应的远端对象是否仍存在
- Northflank 免费实例的冷启动和 0.1 vCPU 是否能承受当前生成任务
- 是否为新加坡/Asia Southeast 新建按量付费项目
- 是否继续保留 Vercel 作为海外备用入口

## Out of scope

- v0.7.0 release 整理（飞书运营底稿、Cloudflare Pages、book-enrichment、WS CORS）—— A 地图
- Render 服务调优（直接 Suspend，不再调优）
- 第三方 API Key 申请（用户已有的话直接配，没有走 mock）

## Tickets

| 编号 | 标题 | 类型 | 状态 | 阻塞 |
|---|---|---|---|---|
| T1 | 拉 Render 线上 build 配置 | research / AFK | ✅ 已完成 | — |
| T5 | 跑 verify-deploy 完整流程 | research / AFK | ✅ 已完成 | — |
| F0 | fly.io 部署基础 + 脚本 + 文档 | deliverable / 已完成 | ✅ 已完成 | — |
| R1 | 确认当前线上部署拓扑与数据存储 | research / AFK | ✅ 已完成 | — |
| C1 | 确认历史 QA B-2a/2b 现状 | research / AFK | ⚪ 前沿 | — |
| F1 | 注册 4 个外部服务（Northflank/Neon/Upstash/B2）+ 初始化资源 | task / HITL | ✅ Northflank + Redis 已完成；B2/Upstash 未用 | R1 |
| F2 | 填 .env.fly + 注入 secrets | task / HITL | ✅ Northflank 现有变量 + Redis secret group 已关联 | F1 |
| F3 | 数据迁移：Render Postgres → Neon | task / HITL | ⏸️ 数据审计完成，远端对象/Render DB 身份待核对 | F1 |
| F4 | 首次部署到 Northflank | task / HITL | ✅ 服务 Running，health 200 | F2 |
| F5 | 线上只读 smoke | research / AFK | ✅ health/BGM/Socket.IO 直连通过 | F4 |
| F6 | 更新 Cloudflare Pages 后端代理到新服务 | task / HITL | 🟡 静态入口已切直连；Pages `/api` 反代仍有 1101 兼容风险 | F5 |
| F7 | 一次性邮箱 10 步线上 E2E | task / HITL | ⚪ 等待 F6 | F6 |
| F8 | 验证 v0.6.3 中文翻译 | research / AFK | ⚪ 等待 F7 | F7 |
| F9 | 验证 v0.6.4 全中文口播稿 | research / AFK | ⚪ 等待 F7 | F7 |
| F10 | 观察 24-72h + 停止 Podcast Render 消耗 | task / HITL | ⚪ 等待 F7 | F7, F8, F9 |

## 前沿（可立即认领）

- **C1**（research/AFK，无阻塞）：确认历史 QA B-2a/2b 现状（可并行做）
- **F3**（task/HITL）：等待 Render 生产数据库身份与远端音频对象凭据
- **F6**（task/HITL）：直连已上线；保留 `/api` 兼容入口的 Cloudflare 1101 需后续决定是否配置自定义域名/其他代理

## 阻塞链

```
F1 ──→ F2 ──→ F4 ──→ F5 ──→ F6 ──→ F7 ──→ F8
  ↘                ↘              ↘     ↘
   F3                F4 调试       F9     F10
```

## 已关闭票（archive/）

- T2/T3/T4/T6/T7/T8/T9 — Render 路径废弃
- M0/M1/M2-M10 — Oracle 路径废弃
- N0 — HF Spaces vs Hetzner 决策作废
- H0/H1-H10 — HF Spaces Docker 改收费，全部废弃
- P0 — Fly.io vs 其他平台决策，本轮已选 Fly.io
