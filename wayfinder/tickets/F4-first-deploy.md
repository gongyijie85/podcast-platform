# F4 — 首次部署到 Northflank

> 类型：task / HITL
> 状态：✅ 已完成；当前部署仍等待 F3 数据对象核对后才可宣布迁移完成
> 标签：`wayfinder:task`

## Question

第一次部署后端到 Northflank。

## 实际结果（2026-07-21）

- Service：`podcast-platform-backend`
- Region：Europe-West (London)
- Commit：`462457a`
- 状态：Running
- URL：`https://p01--podcast-platform-backend--hffrlmw2zxcy.code.run`
- `/api/health`：200
- 初始失败原因：BullMQ 在未配置 Redis 时连接 `127.0.0.1:6379`
- 修复：创建 Northflank `nf-redis` addon，并让配置识别 Northflank 注入的 Redis URL

## 行动清单（HITL，约 30-60 分钟）

### 1. 部署

```bash
cd D:\Broadcast\podcast-platform
在 Northflank Service 页面触发 Deploy，使用 `backend/Dockerfile`。
```

脚本会：
1. 拉取目标分支的代码
2. 使用 `backend/Dockerfile` 构建
3. 注入 F2 中的环境变量
4. 启动容器并执行 Prisma migration

### 2. 看构建日志

构建会显示：
- Dockerfile 阶段
- pnpm install
- prisma generate
- nest build
- 镜像构建并部署到 Northflank
- 启动容器 + prisma migrate deploy + nest start

### 3. 等待部署完成

```bash
在 Northflank Service 页面查看 Deployment 状态
```

期望：`Status: running`

### 4. 健康检查

```bash
```bash
curl https://<service-name>.code.run/api/health
```

期望：`{"code":0,"data":{"status":"ok","commit":"<commit>"},...}`

### 5. 看 logs（如失败）

```bash
在 Northflank Deployment 页面查看日志
```

## 异常处理

- **构建失败**：
  - 看 Dockerfile 哪步错
  - 本地 `docker build -f backend/Dockerfile .` 试一遍
- **启动失败**：
  - 看 Northflank deployment logs 报错
  - 常见：JWT_SECRET 未设 / DATABASE_URL 连不上 / REDIS_URL 格式错
- **Health 500**：
  - 数据库连接问题：测试 Neon connection string 直接 psql
  - Prisma 报错：确认 Neon 连接串和 migration 日志
- **Migrate deploy 失败**：
  - 看迁移历史和容器日志
  - 修复或重新生成 migration

## 完成后

把 Northflank Deployment 状态 + `/api/health` curl 结果 + 部署耗时写进本 ticket 评论。
后续启动 F5（线上 smoke）；F3 数据迁移仍是最终切换前置条件。
