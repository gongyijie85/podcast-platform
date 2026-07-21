# F5 — 线上只读 smoke

> 类型：research / AFK
> 状态：✅ 直连 smoke 通过
> 标签：`wayfinder:research`

## Question

Northflank 后端部署后，只读接口和关键连接是否全部正常？

## 实际结果（2026-07-21）

- `GET /api/health`：200
- `GET /api/bgm/tracks`：200，返回 BGM 列表
- `GET /socket.io/?EIO=4&transport=polling`：200，返回 Socket.IO session
- CORS：`https://podcast-platform-cn-free.pages.dev` 被允许
- Pages 首页：200

注意：Cloudflare Pages Function 直接 fetch `code.run` 上游返回 1101，因此前端构建为直连 Northflank；Pages `/api` 兼容入口不是当前主链路。

## 验证步骤

```bash
APP_URL=https://p01--podcast-platform-backend--hffrlmw2zxcy.code.run

# 1. Health
curl -s $APP_URL/api/health | jq .
# 期望：code:0, status:ok, commit 不为空

# 2. BGM Tracks
curl -s $APP_URL/api/bgm/tracks | jq '.data | length'
# 期望：12

# 3. 关键页面（前端暂时连旧后端，验证 fly 后端能直接返回 SPA HTML 不必要，先看 API）
# 此步可以跳过，等 F6 切前端

# 4. WebSocket
curl -s -o /dev/null -w "%{http_code}" $APP_URL/socket.io/
# 期望：400（socket.io 在不带 sid 时返回 400 是正常的）
```

## 失败模式

- /api/health 200 但无 commit：看 CORS / 日志
- /api/bgm/tracks 空：seed 没跑。看 fly.toml 是否要加 `pnpm seed:bgm` 到 release_command
- 接口 502/503：Koyeb Free 可能已缩容到零，等待冷启动后重试
- 接口 500：后端启动失败，看 Koyeb deployment logs

## 完成后

把所有检查结果写进本 ticket。
如全过，关单，启动 F6。
如失败，单独开 ticket 修复。
