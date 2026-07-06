# 监控与告警说明

> 目标：让系统运行状态可观测，出问题能及时发现并定位。
>
> 适用：Prometheus + Grafana（或 Render/Vercel 自带监控）+ 应用内 /api/metrics 端点。

## 1. 已暴露的指标

后端通过 `@willsoto/nestjs-prometheus` 在 `/api/metrics` 暴露以下指标：

| 指标名 | 类型 | 标签 | 说明 |
|--------|------|------|------|
| `http_requests_total` | Counter | method, path, status | HTTP 请求总数 |
| `http_request_duration_seconds` | Histogram | method, path, status | HTTP 请求耗时（秒） |
| `bullmq_queue_waiting` | Counter | queue | BullMQ 队列新增任务数 |
| `bullmq_queue_completed` | Counter | queue | BullMQ 队列完成任务数 |
| `bullmq_queue_failed` | Counter | queue | BullMQ 队列失败任务数 |
| `process_*` / `node_*` | 默认指标 | - | Node.js 进程内存、CPU、事件循环延迟等 |

队列名称（`queue` label）取值：`metadata`、`script`、`tts`、`subtitle`、`mix`。

## 2. 本地查看指标

启动 Docker Compose 后：

```bash
curl http://localhost:3001/api/metrics
```

## 3. Prometheus 配置示例

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'podcast-backend'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/api/metrics'
    scrape_interval: 15s
```

## 4. 建议的告警规则

### 4.1 服务不可用

```yaml
- alert: PodcastBackendDown
  expr: up{job="podcast-backend"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: '后端服务不可用'
    description: 'Podcast 后端已持续 1 分钟无响应，请检查 Render / Docker 状态。'
```

### 4.2 错误率过高

```yaml
- alert: PodcastHighErrorRate
  expr: |
    (
      sum(rate(http_requests_total{status=~"5.."}[5m]))
      /
      sum(rate(http_requests_total[5m]))
    ) > 0.05
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: 'HTTP 5xx 错误率超过 5%'
    description: '过去 5 分钟内 5xx 错误率 {{ $value | humanizePercentage }}。'
```

### 4.3 队列任务失败

```yaml
- alert: PodcastQueueFailures
  expr: |
    sum by (queue) (rate(bullmq_queue_failed[5m])) > 0.1
  for: 1m
  labels:
    severity: warning
  annotations:
    summary: '队列 {{ $labels.queue }} 任务失败率异常'
    description: '过去 5 分钟 {{ $labels.queue }} 队列失败率持续升高。'
```

### 4.4 响应时间过长

```yaml
- alert: PodcastSlowRequests
  expr: |
    histogram_quantile(0.95,
      sum(rate(http_request_duration_seconds_bucket[5m])) by (le, path)
    ) > 2
  for: 3m
  labels:
    severity: warning
  annotations:
    summary: 'P95 响应时间超过 2 秒'
    description: '接口 {{ $labels.path }} P95 响应时间 {{ $value }}s。'
```

## 5. 健康检查

后端提供 `/api/health`：

```bash
curl http://localhost:3001/api/health
# {"status":"ok"}
```

Docker Compose、Render 和 Dockerfile 均配置 HEALTHCHECK，会定期调用该端点。

## 6. 日志查看

- 本地：`docker compose logs -f backend`
- Render：Dashboard → Logs
- 生产环境日志为 NDJSON 格式，可用 `pino-pretty` 本地美化：

```bash
pnpm --filter backend pino-pretty < logs.jsonl
```

> 注意：生产日志已脱敏，不会输出 `authorization`、`cookie`、`password`、`refreshToken`。

## 7. 常用排查命令

```bash
# 查看后端是否健康
curl http://localhost:3001/api/health

# 查看队列状态（需 Redis）
pnpm --filter backend queue:status

# 查看 Prisma 迁移状态
cd backend && npx prisma migrate status

# 查看最近错误日志
docker compose logs --tail=100 backend
```

---

**最后更新**：2026-07-05
