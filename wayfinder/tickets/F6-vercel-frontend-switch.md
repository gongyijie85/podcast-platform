# F6 — Cloudflare Pages 切到新后端

> 类型：task / HITL
> 状态：🟡 直连已上线；同源 Function 反代保留风险
> 标签：`wayfinder:task`

## Question

把 Cloudflare Pages 的前端调用切到新 Northflank 后端。

## 前置条件

- F5 通过，新后端 `/api/health` 200
- 用户有 Cloudflare Pages 项目访问权限

## 行动清单（HITL，约 15-30 分钟）

### 1. 决定 VITE_API_BASE_URL

| 场景 | 值 |
|---|---|
| Northflank 直连 | `https://p01--podcast-platform-backend--hffrlmw2zxcy.code.run` |
| Cloudflare Pages Function | `BACKEND_URL` 已设置，但 Worker fetch `code.run` 返回 1101 |

**当前选择**：前端构建时使用 Northflank 直连，WebSocket 也直连；Pages 只负责静态文件。

### 2. 更新 Cloudflare Pages Secret

1. Cloudflare Pages 项目 `podcast-platform-cn-free` 已生产部署。
2. `VITE_API_BASE_URL` 与 `VITE_WS_URL` 指向 Northflank service URL。
3. `BACKEND_URL` secret 保留作兼容入口；Function 改为 307 redirect。

### 3. 触发 Redeploy

1. Deployments → 最新部署 → **Retry deployment**
2. 等待 Ready

### 4. 验证前端调用新后端

1. 打开 https://podcast-platform-cn-free.pages.dev
2. F12 → Network → 选一个 API 请求（如 `/api/bgm/tracks`）
3. **当前 URL**: 前端直接请求 Northflank `/api/bgm/tracks`
4. **期望 status**: 200

### 5. 验证 CORS

看 Response Headers，应有：
```
Access-Control-Allow-Origin: https://podcast-platform-cn-free.pages.dev
```

如缺失 → 检查 Koyeb 的 `CORS_ORIGINS` 是否包含 Cloudflare Pages 域名。

## 完成后

把前端 Network 截图或 curl 结果写进本 ticket 评论。
关单，启动 F7（10 步 E2E）。
