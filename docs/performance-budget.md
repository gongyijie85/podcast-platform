# 性能预算

> 版本：v1.0（2026-07-05）
> 目标：为 podcast-platform 定义可量化的性能基线，作为后续优化的验收依据。

## 1. 前端预算

| 指标 | 预算 | 测量方式 |
|------|------|----------|
| 首屏 JS（gzip） | < 500 KB | `vite build` 后查看 `dist/assets/*.js` 体积 |
| 首屏 CSS（gzip） | < 100 KB | 同上 |
| 首屏 LCP | < 2.5s | Lighthouse 移动端 |
| FID / INP | < 200ms | Lighthouse |
| CLS | < 0.1 | Lighthouse |
| Lighthouse 性能分 | >= 70 | 移动端 |
| Lighthouse 可访问性分 | >= 90 | 桌面端 |

### 路由懒加载
- 所有页面级路由已使用 `React.lazy()` + `Suspense`（`frontend/src/router/index.tsx`）。
- 新增页面必须保持懒加载，禁止在 `router/index.tsx` 中直接 `import`。

### 图片
- 图书封面 `<Avatar>` / `<img>` 使用 `loading="lazy"`。
- 大图列表页使用 `Intersection Observer` 或 MUI `LazyLoading` 模式。

## 2. 后端预算

| 指标 | 预算 | 测量方式 |
|------|------|----------|
| `/api/health` P95 | < 200ms | Prometheus `/api/metrics` 或日志统计 |
| 单本图书元数据获取 P95 | < 3s | 第三方 API 响应时间 + 本地缓存命中 |
| 完整 pipeline P95 | < 15min | BullMQ job 完成时间 |
| 单段 TTS 合成 P95 | < 10s | 日志统计 |
| BGM 曲库接口 P95 | < 100ms | 准静态数据，应走缓存 |

### 数据库查询
- `Project` 详情页查询使用 Prisma `include` 一次性加载关联，禁止 N+1。
- `BookLibrary` 列表使用 `findMany` + `count` 分页，`take` 上限 50。
- 热点查询（BGM 列表、音色列表）应加 `Cache-Control: public, max-age=300`。

### BullMQ 队列
- 单 job 超时：300s（5min）。
- 队列堆积告警阈值：waiting > 50 时告警。
- 失败重试：3 次，指数退避。

## 3. 第三方依赖预算

| 依赖 | 超时 | 重试 | 兜底 |
|------|------|------|------|
| Open Library | 10s | 1 次 | 返回 5 本示例书 |
| Google Books | 10s | 1 次 | 返回 3 本示例书 |
| Xiaomi MiMo LLM | 60s | 1 次 | 返回固定双人播客脚本 |
| 火山 TTS | 30s/段 | 2 次 | 返回 1s 静音 MP3 |
| Azure TTS | 30s/段 | 2 次 | 同上 |
| BookRank | 15s | 0 次 | 返回错误，不伪造数据 |

## 4. 基础设施预算

| 资源 | 预算 | 说明 |
|------|------|------|
| Render Free 内存 | 512 MB | 后端单实例；超出会被 OOM kill |
| Render Free 构建时间 | 15 min | 超时构建失败 |
| Vercel Hobby 函数执行 | 10s | 前端 Serverless 函数超时 |
| PostgreSQL 连接数 | 20 | Render Free Postgres 上限 |
| Redis 内存 | 25 MB | BullMQ 队列 + 缓存 |

## 5. 监控与告警

- Prometheus 指标端点：`/api/metrics`
- 健康检查：`/api/health`
- 告警规则见 [docs/monitoring-alerting.md](monitoring-alerting.md)
- 关键告警：
  - `/api/health` 连续 3 次失败 → 邮件通知
  - `bullmq_queue_failed` 增长率 > 5/min → 邮件通知
  - Render 实例 OOM → 自动重启 + 通知

## 6. 优化优先级

| 优先级 | 项目 | 预期收益 |
|--------|------|----------|
| P0 | BGM / 音色列表加 Cache-Control | 减少重复请求，接口延迟下降 80%+ |
| P1 | 前端 Suspense 骨架屏细化 | 改善感知性能，LCP 提升 |
| P2 | 数据库查询 include 优化 | ProjectDetail 接口延迟下降 30%+ |
| P3 | 第三方 API 结果缓存 | 图书元数据重复请求延迟下降 90% |
| P4 | CDN 静态资源 | 前端静态资源全球加速 |
