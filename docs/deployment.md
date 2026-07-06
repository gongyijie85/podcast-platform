# Deployment

## Local Dev

```bash
pnpm install
pnpm dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- MinIO Console: http://localhost:9001 (minioadmin / minioadmin)
- Postgres: localhost:5432 (postgres / postgres)
- Redis: localhost:6379

## Docker Compose

```bash
docker compose up -d
```

## Production (K8s, reserved for v2)

- 镜像：`backend.Dockerfile` + `frontend.Dockerfile`
- 配置通过 ConfigMap / Secret 注入
- 数据库用云 RDS；Redis 用云 Redis；对象存储用阿里云 OSS
- 入口用 Nginx Ingress，WS 路径单独配置 1h 超时

## 健康检查

- Backend: `GET /api/health` → `{"code":0,"data":{"status":"ok"}}`（全局前缀 `/api`）
- 容器: Docker healthcheck 已配置 PG / Redis / MinIO
