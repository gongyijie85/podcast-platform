# API 契约（API Contract）

> 本文档为前后端协作的单一事实来源。**所有 REST 端点必须返回 `ApiResponse<T>` 格式**，WebSocket 事件遵循 `ProgressEvent` 格式。

## 0. 通用约定

### 0.1 响应格式
```ts
// 成功
{ code: 0,    data: T,         message: 'ok',      traceId: 'uuid' }
// 失败
{ code: 1xxx+, data: null,     message: '...',     traceId: 'uuid' }
```

### 0.2 错误码（区间）
- `1xxx` 通用：`10001` 参数 / `10002` 未授权 / `10003` 禁止 / `10004` 不存在 / `10005` 限流
- `2xxx` 用户：`20001` 邮箱已注册 / `20002` 密码错 / `20003` token 过期
- `3xxx` ISBN：`30001` 格式非法 / `30002` 抓取失败 / `30003` 重试超限
- `4xxx` LLM：`40001` LLM 失败 / `40002` 长度超限 / `40003` 合规拒绝
- `5xxx` TTS：`50001` 音色不存在 / `50002` 合成失败 / `50003` 试听超限
- `6xxx` 任务：`60001` 不存在 / `60002` 已结束 / `60003` 取消失败
- `9xxx` 系统：`90001` 内部错误 / `90002` 第三方超时 / `90003` 存储失败

### 0.3 鉴权
- 登录后返回 `accessToken` (15min) + `refreshToken` (7d)。
- `Authorization: Bearer <accessToken>`。
- 401 时前端拦截器自动调 `/api/auth/refresh`，失败跳登录。

### 0.4 Trace ID
- 请求头 `X-Trace-Id` 由前端生成（UUID v4），后端透传到日志、WS 事件、错误码响应。

---

## 1. 鉴权 (Auth)

| Method | Path | Body | 200 | 失败 |
|--------|------|------|----|------|
| POST | `/api/auth/register` | `{email, password, nickname}` | `AuthResponse` | `20001` 邮箱已注册 |
| POST | `/api/auth/login` | `{email, password}` | `AuthResponse` | `20002` 密码错 |
| POST | `/api/auth/refresh` | `{refreshToken}` | `AuthTokens` | `20003` 过期 |
| GET | `/api/auth/me` | - | `UserDto` | `10002` 未登录 |
| POST | `/api/auth/logout` | - | `null` | - |

## 2. 图书 (Books)

| Method | Path | 描述 |
|--------|------|------|
| POST | `/api/books/metadata` | ISBN 批量元数据（异步） |
| GET | `/api/books/metadata/:jobId` | 任务结果 |

## 3. 项目 (Projects)

| Method | Path | 描述 |
|--------|------|------|
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects` | 历史项目（分页） |
| GET | `/api/projects/:id` | 项目详情 |
| PATCH | `/api/projects/:id` | 更新配置 |
| POST | `/api/projects/:id/generate` | 启动生成流水线 |
| POST | `/api/projects/:id/cancel` | 取消生成 |
| POST | `/api/projects/:id/regenerate` | 重合成（脚本编辑后） |
| GET | `/api/projects/:id/script` | 拉脚本 |
| PUT | `/api/projects/:id/script` | 保存脚本 |
| GET | `/api/projects/:id/audio` | 拉音频 URL |
| GET | `/api/projects/:id/subtitle?format=srt\|vtt` | 字幕 |
| GET | `/api/projects/:id/export?format=zip\|mp3\|srt\|vtt\|txt\|pdf` | 导出 |

## 4. BGM

| Method | Path | 描述 |
|--------|------|------|
| GET | `/api/bgm/tracks` | 曲库列表 |
| GET | `/api/bgm/categories` | 曲库分类 |

## 5. TTS

| Method | Path | 描述 |
|--------|------|------|
| GET | `/api/tts/voices` | 音色列表 |
| POST | `/api/tts/preview` | 试听 |

## 6. 健康检查

| Method | Path | 描述 |
|--------|------|------|
| GET | `/health` | 返回 `{status:'ok'}` |

## 7. WebSocket

- Endpoint: `/socket.io/`（Socket.IO）
- 客户端事件：`project.subscribe` `{projectId}`
- 服务端事件：`project.progress`（见 shared/types/job.ts `ProgressEvent`）

## 8. 版本

- v1.0（2024-10）：初版
