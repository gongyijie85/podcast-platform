# 系统架构设计文档 —— 响应式 AI 播客制作平台

| 项目 | 内容 |
|------|------|
| Project Name | `podcast-platform` |
| 文档版本 | v1.0 |
| 撰写人 | Bob（架构师 高见远） |
| 适用范围 | 主理人、工程师、测试 |
| 关联文档 | `podcast-platform-prd.md`（v1.0） |
| 一句话定位 | "ISBN 批量输入 → 拉元数据 → 豆包生成双人脚本 → TTS 配音 + BGM → 合成 MP3 + SRT/VTT + 字幕波形联动 → 多格式导出" 的一站式 Web 平台 |

---

## 0. 关键架构决策（一张图给主理人）

| 维度 | 决策 | 关键理由 |
|------|------|----------|
| 前端 | **Vite + React 18 + TypeScript + MUI v5 + Tailwind CSS** + Zustand（状态）+ React Router v6 + Socket.IO Client + wavesurfer.js | 与 PRD 默认栈一致；MUI 提供 Snackbar/Dialog/Stepper；wavesurfer.js 成熟稳定；Zustand 比 Redux 轻量 |
| 后端 | **Node.js 20 + NestJS 10 + TypeScript**（确认选择，替代 Spring Boot） | 与前端同语言（团队复用 TS）；NestJS 模块化、DI、Guard/Pipe 与企业级契合；BullMQ 官方同生态 |
| 异步任务 | **BullMQ + Redis 7** | Redis 持久化队列；支持并发、优先级、重试、延迟、进度推送；Node 生态首选 |
| 数据库 | **PostgreSQL 15**（业务数据）+ **Redis 7**（队列/缓存/Session） | PRD 推荐；PG 适合结构化（用户/项目/偏好），Redis 适合临时态（任务/进度） |
| 对象存储 | **MinIO（本地开发）+ 阿里云 OSS（生产）**，S3 兼容 | PRD 推荐；MinIO 零成本本地起，OSS 走 SDK 切换无侵入 |
| 进度推送 | **WebSocket（Socket.IO）** 主通道 → **SSE** 降级 → **轮询** 兜底 | PRD 建议；Socket.IO 自带心跳/重连/房间，对长任务最合适 |
| 第三方适配 | **策略模式 + 适配器** 统一抽象：`BookApiAdapter / LlmAdapter / TtsAdapter` | 避免供应商锁定；按需切换/多通道并行 |
| 图书元数据 | **Open Library（主）+ Google Books（备）+ 豆瓣（可选中文增强）** | Open Library 免费无 key；Google Books 备援；豆瓣数据好但需反爬策略 |
| 大模型 | **豆包 Doubao-Pro-32k** 主，**DeepSeek** 备 | 豆包中文好、价格低；脚本生成是结构化输出，模型可替换 |
| TTS | **火山引擎 TTS（主）+ 微软 Azure TTS（备）** | 火山音色多、中文自然；Azure 备援稳定 |
| 音频混音 | **fluent-ffmpeg**（Node 绑定）+ `ffmpeg` 系统二进制 | 人声+BGM 混流、音量渐变、字幕嵌入用 ffmpeg 一站式 |
| 音频波形 | **wavesurfer.js v7**（前端） | 主流方案，支持点击跳转/进度高亮 |
| 富文本脚本 | **TipTap**（基于 ProseMirror） | MUI 生态不冲突；支持自定义节点（speaker/emotion） |
| 登录 | **JWT + Refresh Token**（邮箱/手机号密码，第三方登录留接口） | 无状态、易扩展；PRD P0-14 强调"游客/登录双模式" |
| 部署 | **Docker Compose**（本地）+ **Kubernetes**（生产预留） | 一键起 PG/Redis/MinIO/后端/前端 |
| 监控 | **Pino**（结构化日志）+ **健康检查端点**（`/health`） | NestJS 官方推荐 |
| 测试 | **Jest**（前后端单元）+ **Supertest**（后端 API）+ **Vitest + Testing Library**（前端） | 标准组合 |
| 国际化 | **i18next + react-i18next**（中/英预留） | P2-01，预留不实现 |

---

# Part A：系统设计

## 1. 实现方案（Implementation Approach）

### 1.1 核心难点分析

| 难点 | 描述 | 应对 |
|------|------|------|
| **D1 长链路异步编排** | ISBN→元数据→脚本→TTS→字幕→混音是 4~5 阶段流水线，单次任务可达 60~120s，HTTP 必须异步 | BullMQ 任务编排 + WebSocket 进度推送 + Redis 缓存中间结果 |
| **D2 多供应商适配** | 图书 API / 大模型 / TTS 都需主备，字段/音色/限流各异 | 统一接口 + 适配器 + 策略路由 + 失败自动降级 |
| **D3 音频混流与字幕对齐** | 多段 TTS 拼接 + BGM 叠加 + 渐入渐出 + SRT/VTT 字幕生成，时间轴误差 < 200ms | ffmpeg `amix`/`acrossfade` + 基于 TTS 时间戳精确切片 |
| **D4 取消与断点续做** | 用户中途取消，已生成的脚本/片段不能丢，二次进入能继续 | 任务状态机：pending→running→partial→done/cancelled；中间产物落 MinIO |
| **D5 浏览器音频+字幕+波形联动** | 字幕高亮、波形点击跳转、字号可调 | wavesurfer.js + 原生 `<audio>` + 自研 SubtitleCue 组件；通过 `currentTime` 双向同步 |
| **D6 响应式 + 移动端** | 4 步流程在 < 768px 折叠为单列，Stepper 纵向 | MUI `useMediaQuery` + Tailwind 断点 + 抽屉式导航 |
| **D7 异常与重试** | ISBN 非法、API 超时、网络中断、生成失败——必须 3 次自动重试 + 手动重试 | 全局 `RetryInterceptor` + Axios retry-adapter + 任务级重试配置 |
| **D8 双模式持久化** | 游客 localStorage；登录云端持久化；二者在"登录后合并" | 前端 `StorageAdapter` 接口 + 后端 `POST /projects/sync` 合并策略 |

### 1.2 架构模式

- **前端**：组件化 + Hooks + 容器/展示分离；状态管理 Zustand（轻量），不使用 Redux；所有异步走 React Query 风格的 SWR 缓存（自研 `useApi` hook）。
- **后端**：NestJS MVC-like 分层（Controller → Service → Repository）；模块化（Auth / Project / Book / Script / Tts / Subtitle / Mix / Queue / Ws）；统一异常过滤器 + 响应拦截器。
- **任务编排**：4 个 BullMQ 队列（`metadata / script / tts / mix`），任务之间通过 `jobId` 串联，进度写入 Redis Hash。
- **通信**：REST（CRUD + 控制命令）+ WebSocket（实时进度）+ 适配器直连第三方（部分 TTS 支持 stream）。
- **存储分层**：热数据（Redis）→ 温数据（PostgreSQL）→ 冷数据（MinIO/OSS）。

### 1.3 关键流程概要

1. **选书**：用户输入 ISBN → 前端正则校验 → 调 `POST /api/books/metadata`（批量） → 后端入队 `metadata` 任务 → 拉取元数据 → 写库 → WebSocket 推送 → 前端展示。
2. **配置**：用户选音色 + BGM + 音量 + 渐变 → 调 `POST /api/projects`（创建项目）→ 后端持久化。
3. **生成**：用户点"开始生成" → `POST /api/projects/:id/generate` → 后端按顺序入队 4 类任务（script → tts → subtitle → mix）→ WebSocket 推阶段进度 → 前端 4 阶段进度条。
4. **预览&导出**：调 `GET /api/projects/:id` 拉成品 → 前端 `<AudioPlayer>` + 波形 + 字幕 → 修改脚本触发 `POST /api/projects/:id/regenerate`（增量合成）→ 导出 `GET /api/projects/:id/export?format=zip`。

---

## 2. 完整文件列表

> 项目根目录 `podcast-platform/`，前后端分仓 + Docker Compose。

```
podcast-platform/
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .editorconfig
├── package.json                          # monorepo workspaces 根
│
├── docs/
│   ├── architecture.md                   # 本文件
│   ├── api-contract.md                    # API 契约
│   ├── sequence-diagram.mermaid           # 关键时序图
│   ├── class-diagram.mermaid              # 类图
│   └── deployment.md                      # 部署说明
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── index.html
│   ├── .env.example
│   ├── public/
│   │   ├── favicon.svg
│   │   └── logo.svg
│   └── src/
│       ├── main.tsx                       # 应用入口
│       ├── App.tsx                        # 根组件 + 路由
│       ├── index.css                      # Tailwind 基础
│       │
│       ├── types/                         # 全局类型定义
│       │   ├── book.ts
│       │   ├── project.ts
│       │   ├── script.ts
│       │   ├── audio.ts
│       │   ├── job.ts
│       │   ├── user.ts
│       │   └── api.ts
│       │
│       ├── api/                           # API 客户端
│       │   ├── client.ts                  # axios 实例 + 拦截器
│       │   ├── book.api.ts
│       │   ├── project.api.ts
│       │   ├── script.api.ts
│       │   ├── tts.api.ts                 # 试听
│       │   ├── bgm.api.ts
│       │   ├── export.api.ts
│       │   └── auth.api.ts
│       │
│       ├── ws/                            # WebSocket
│       │   └── socket.ts
│       │
│       ├── store/                         # Zustand 状态
│       │   ├── project.store.ts           # 当前项目状态
│       │   ├── books.store.ts             # 选中书籍
│       │   ├── config.store.ts            # 音色/BGM 配置
│       │   ├── progress.store.ts          # 生成进度
│       │   ├── user.store.ts              # 登录态
│       │   └── ui.store.ts                # Snackbar/Dialog
│       │
│       ├── storage/                       # 持久化
│       │   ├── local-storage.adapter.ts
│       │   └── storage.interface.ts
│       │
│       ├── i18n/
│       │   ├── index.ts
│       │   ├── zh-CN.json
│       │   └── en-US.json
│       │
│       ├── hooks/                         # 通用 hooks
│       │   ├── useApi.ts
│       │   ├── useProgress.ts
│       │   ├── useDebounce.ts
│       │   └── useMediaQuery.ts
│       │
│       ├── components/                    # 通用组件
│       │   ├── layout/
│       │   │   ├── AppHeader.tsx
│       │   │   ├── AppFooter.tsx
│       │   │   ├── StepIndicator.tsx
│       │   │   └── MobileDrawer.tsx
│       │   ├── feedback/
│       │   │   ├── SnackbarProvider.tsx
│       │   │   ├── LoadingButton.tsx
│       │   │   ├── ErrorBoundary.tsx
│       │   │   └── EmptyState.tsx
│       │   ├── player/
│       │   │   ├── AudioPlayer.tsx
│       │   │   ├── Waveform.tsx
│       │   │   ├── SubtitleOverlay.tsx
│       │   │   └── PlaybackControls.tsx
│       │   └── editor/
│       │       ├── ScriptEditor.tsx       # TipTap 富文本
│       │       └── SegmentNode.tsx        # 自定义节点
│       │
│       ├── pages/                         # 4 步页面
│       │   ├── BookSelectPage.tsx
│       │   ├── ConfigPage.tsx
│       │   ├── GeneratingPage.tsx
│       │   └── PreviewExportPage.tsx
│       │
│       ├── features/                      # 功能模块（页面内子组件）
│       │   ├── book-select/
│       │   │   ├── IsbnInput.tsx
│       │   │   ├── ModeSelector.tsx
│       │   │   └── BookListItem.tsx
│       │   ├── config/
│       │   │   ├── VoiceSelector.tsx
│       │   │   ├── VoicePreviewPlayer.tsx
│       │   │   ├── BgmSegmentConfig.tsx
│       │   │   ├── VolumeSlider.tsx
│       │   │   └── FadeSelector.tsx
│       │   ├── generating/
│       │   │   ├── ProgressBar.tsx
│       │   │   ├── StageList.tsx
│       │   │   └── CancelDialog.tsx
│       │   └── preview-export/
│       │       ├── ScriptPanel.tsx
│       │       ├── ExportPanel.tsx
│       │       └── RegenerateButton.tsx
│       │
│       ├── pages/Auth/
│       │   ├── LoginPage.tsx
│       │   └── RegisterPage.tsx
│       │
│       ├── utils/                         # 工具
│       │   ├── isbn.ts                    # ISBN 校验
│       │   ├── format.ts
│       │   ├── download.ts
│       │   └── logger.ts
│       │
│       └── constants/
│           ├── env.ts
│           ├── emotions.ts
│           └── voices.ts                  # 音色元数据常量
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   ├── .env.example
│   ├── Dockerfile
│   └── src/
│       ├── main.ts                        # 启动入口
│       ├── app.module.ts
│       │
│       ├── common/                         # 公共
│       │   ├── filters/
│       │   │   └── http-exception.filter.ts
│       │   ├── interceptors/
│       │   │   └── response.interceptor.ts
│       │   ├── decorators/
│       │   │   └── current-user.decorator.ts
│       │   ├── guards/
│       │   │   └── jwt-auth.guard.ts
│       │   ├── pipes/
│       │   │   └── validation.pipe.ts
│       │   └── dto/
│       │       ├── pagination.dto.ts
│       │       └── api-response.dto.ts
│       │
│       ├── config/
│       │   ├── configuration.ts
│       │   ├── database.config.ts
│       │   ├── redis.config.ts
│       │   ├── storage.config.ts
│       │   └── third-party.config.ts
│       │
│       ├── prisma/
│       │   ├── prisma.module.ts
│       │   ├── prisma.service.ts
│       │   └── schema.prisma              # 数据库 schema
│       │
│       ├── modules/
│       │   ├── auth/
│       │   │   ├── auth.module.ts
│       │   │   ├── auth.controller.ts
│       │   │   ├── auth.service.ts
│       │   │   ├── jwt.strategy.ts
│       │   │   └── dto/
│       │   │       ├── login.dto.ts
│       │   │       └── register.dto.ts
│       │   │
│       │   ├── user/
│       │   │   ├── user.module.ts
│       │   │   ├── user.service.ts
│       │   │   └── user.repository.ts
│       │   │
│       │   ├── book/                       # 图书元数据
│       │   │   ├── book.module.ts
│       │   │   ├── book.controller.ts
│       │   │   ├── book.service.ts
│       │   │   ├── adapters/
│       │   │   │   ├── book-api.adapter.ts        # 接口
│       │   │   │   ├── open-library.adapter.ts
│       │   │   │   ├── google-books.adapter.ts
│       │   │   │   └── douban.adapter.ts
│       │   │   └── dto/
│       │   │       ├── fetch-metadata.dto.ts
│       │   │       └── book.dto.ts
│       │   │
│       │   ├── project/
│       │   │   ├── project.module.ts
│       │   │   ├── project.controller.ts
│       │   │   ├── project.service.ts
│       │   │   ├── project.repository.ts
│       │   │   └── dto/
│       │   │       ├── create-project.dto.ts
│       │   │       ├── update-config.dto.ts
│       │   │       └── project.dto.ts
│       │   │
│       │   ├── script/                     # AI 脚本
│       │   │   ├── script.module.ts
│       │   │   ├── script.controller.ts
│       │   │   ├── script.service.ts
│       │   │   ├── adapters/
│       │   │   │   ├── llm.adapter.ts             # 接口
│       │   │   │   ├── doubao.adapter.ts
│       │   │   │   └── deepseek.adapter.ts
│       │   │   ├── prompts/
│       │   │   │   ├── six-segment.template.ts    # 六段式
│       │   │   │   └── merge-mode.template.ts     # 合并模式
│       │   │   └── dto/
│       │   │       └── script.dto.ts
│       │   │
│       │   ├── tts/                        # TTS
│       │   │   ├── tts.module.ts
│       │   │   ├── tts.controller.ts
│       │   │   ├── tts.service.ts
│       │   │   ├── adapters/
│       │   │   │   ├── tts.adapter.ts             # 接口
│       │   │   │   ├── volcengine.adapter.ts
│       │   │   │   └── azure.adapter.ts
│       │   │   └── dto/
│       │   │       └── tts-voice.dto.ts
│       │   │
│       │   ├── bgm/
│       │   │   ├── bgm.module.ts
│       │   │   ├── bgm.controller.ts
│       │   │   ├── bgm.service.ts
│       │   │   └── bgm.seed.ts                     # 初始曲库
│       │   │
│       │   ├── subtitle/
│       │   │   ├── subtitle.module.ts
│       │   │   ├── subtitle.service.ts
│       │   │   ├── srt.generator.ts
│       │   │   └── vtt.generator.ts
│       │   │
│       │   ├── mix/                        # 混音
│       │   │   ├── mix.module.ts
│       │   │   ├── mix.service.ts
│       │   │   ├── ffmpeg.util.ts
│       │   │   └── mix.processor.ts
│       │   │
│       │   ├── export/
│       │   │   ├── export.module.ts
│       │   │   ├── export.controller.ts
│       │   │   ├── export.service.ts
│       │   │   ├── pdf.generator.ts
│       │   │   └── zip.packager.ts
│       │   │
│       │   ├── storage/                    # 对象存储
│       │   │   ├── storage.module.ts
│       │   │   ├── storage.service.ts
│       │   │   ├── adapters/
│       │   │   │   ├── storage.adapter.ts         # 接口
│       │   │   │   ├── minio.adapter.ts
│       │   │   │   └── oss.adapter.ts
│       │   │
│       │   ├── queue/                      # BullMQ
│       │   │   ├── queue.module.ts
│       │   │   ├── queue.service.ts
│       │   │   ├── constants.ts                   # 队列名
│       │   │   └── processors/
│       │   │       ├── metadata.processor.ts
│       │   │       ├── script.processor.ts
│       │   │       ├── tts.processor.ts
│       │   │       ├── subtitle.processor.ts
│       │   │       └── mix.processor.ts
│       │   │
│       │   └── ws/                         # WebSocket Gateway
│       │       ├── ws.module.ts
│       │       ├── progress.gateway.ts
│       │       └── progress-event.dto.ts
│       │
│       └── health/
│           └── health.controller.ts
│
├── shared/                                # 前后端共享类型
│   └── types/
│       ├── book.ts
│       ├── project.ts
│       ├── script.ts
│       ├── job.ts
│       └── api.ts
│
└── infra/
    ├── docker/
    │   ├── frontend.Dockerfile
    │   ├── backend.Dockerfile
    │   └── nginx.conf
    └── scripts/
        ├── init-db.sh
        └── seed.sh
```

**文件总数**：约 130 个（含配置/类型/测试）。本架构文档涵盖所有必要文件，避免单文件粒度过细。

---

## 3. 数据结构与接口

### 3.1 核心类图（Class Diagram）

```mermaid
classDiagram
    class User {
        +string id
        +string email
        +string phone
        +string passwordHash
        +string nickname
        +string avatarUrl
        +DateTime createdAt
        +DateTime updatedAt
    }

    class Project {
        +string id
        +string userId
        +string title
        +string mode        // independent | merged
        +string status      // draft | generating | done | failed | cancelled
        +number progress    // 0~100
        +string currentStage
        +DateTime createdAt
        +DateTime updatedAt
    }

    class ProjectBook {
        +string id
        +string projectId
        +string isbn
        +string title
        +string author
        +string coverUrl
        +string summary
        +number orderIndex
    }

    class Script {
        +string id
        +string projectId
        +string version
        +string content     // 富文本 JSON
        +string rawText
        +number wordCount
    }

    class ScriptSegment {
        +string id
        +string scriptId
        +number orderIndex
        +string speaker     // host | guest
        +string text
        +string emotion     // 开心|沉思|激昂|平缓|...
        +string stage       // intro|introduce|interpret|review|suggest|closing
        +number startTime   // ms
        +number endTime     // ms
    }

    class AudioFile {
        +string id
        +string projectId
        +string type        // tts_segment | mix_full | mix_intro | mix_body | mix_outro
        +string storageKey  // MinIO/OSS key
        +string format      // mp3|wav
        +number durationMs
        +number sizeBytes
    }

    class SubtitleFile {
        +string id
        +string projectId
        +string format      // srt | vtt
        +string content
        +string storageKey
    }

    class BgmTrack {
        +string id
        +string name
        +string category    // 轻松|科技|人文|纪实
        +string storageKey
        +number durationMs
    }

    class BgmConfig {
        +string id
        +string projectId
        +string segment     // intro|body|outro
        +string bgmTrackId
        +number volume      // 0~100
        +number fadeInMs
        +number fadeOutMs
    }

    class VoiceConfig {
        +string id
        +string projectId
        +string role        // host | guest
        +string voiceId     // 火山/微软 voice id
        +string provider    // volcengine | azure
    }

    class Job {
        +string id
        +string projectId
        +string type        // metadata|script|tts|subtitle|mix
        +string status      // pending|active|completed|failed|cancelled
        +number progress
        +string payload     // JSON
        +string error
        +DateTime createdAt
        +DateTime finishedAt
    }

    class UserPreference {
        +string id
        +string userId
        +string key
        +string value       // JSON
    }

    %% 服务/适配器层
    class BookApiAdapter {
        <<interface>>
        +fetchByIsbn(isbn) BookMetadata
        +fetchBatch(isbns) BookMetadata[]
    }
    class OpenLibraryAdapter {
        -httpClient
        +fetchByIsbn(isbn) BookMetadata
        +fetchBatch(isbns) BookMetadata[]
    }
    class GoogleBooksAdapter {
        +fetchByIsbn(isbn) BookMetadata
    }

    class LlmAdapter {
        <<interface>>
        +generateScript(bookContext, prompt) ScriptSegment[]
    }
    class DoubaoAdapter {
        -apiKey
        +generateScript(...) ScriptSegment[]
    }

    class TtsAdapter {
        <<interface>>
        +synthesize(text, voiceId) Buffer
        +listVoices() Voice[]
    }
    class VolcengineTtsAdapter {
        +synthesize(...) Buffer
        +listVoices() Voice[]
    }

    class StorageAdapter {
        <<interface>>
        +put(key, buffer) string
        +get(key) Buffer
        +getSignedUrl(key, expires) string
    }
    class MinioStorageAdapter {
        +put(...) string
    }

    class QueueService {
        +enqueueMetadata(isbns) string
        +enqueueScript(projectId) string
        +enqueueTts(projectId) string
        +enqueueMix(projectId) string
        +cancelJob(jobId) void
    }

    class ProgressGateway {
        -socketServer
        +emitProgress(projectId, event) void
    }

    %% 关系
    User "1" --> "*" Project
    User "1" --> "*" UserPreference
    Project "1" --> "*" ProjectBook
    Project "1" --> "1" Script
    Project "1" --> "*" AudioFile
    Project "1" --> "*" SubtitleFile
    Project "1" --> "1" VoiceConfig (host)
    Project "1" --> "1" VoiceConfig (guest)
    Project "1" --> "*" BgmConfig
    Project "1" --> "*" Job
    Script "1" --> "*" ScriptSegment
    BgmConfig "1" --> "1" BgmTrack
    OpenLibraryAdapter ..|> BookApiAdapter
    GoogleBooksAdapter ..|> BookApiAdapter
    DoubaoAdapter ..|> LlmAdapter
    VolcengineTtsAdapter ..|> TtsAdapter
    MinioStorageAdapter ..|> StorageAdapter
```

### 3.2 关键 API 接口（REST 契约）

| Method | Path | 描述 |
|--------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录，返回 JWT |
| POST | `/api/auth/refresh` | 刷新 token |
| GET | `/api/auth/me` | 当前用户 |
| POST | `/api/books/metadata` | ISBN 批量拉取元数据（异步） |
| GET | `/api/books/metadata/:jobId` | 查询元数据任务结果 |
| GET | `/api/bgm/tracks` | 曲库列表 |
| GET | `/api/bgm/categories` | 曲库分类 |
| POST | `/api/tts/preview` | 试听音色（≤10s） |
| GET | `/api/tts/voices` | 可用音色列表 |
| POST | `/api/projects` | 创建项目（含 ISBN 列表 + 配置） |
| GET | `/api/projects/:id` | 项目详情 |
| PATCH | `/api/projects/:id` | 更新配置 |
| POST | `/api/projects/:id/generate` | 启动生成流水线 |
| POST | `/api/projects/:id/cancel` | 取消生成 |
| POST | `/api/projects/:id/regenerate` | 重合成（脚本修改后） |
| GET | `/api/projects/:id/script` | 拉脚本 |
| PUT | `/api/projects/:id/script` | 保存脚本（自动草稿 5s/次） |
| GET | `/api/projects/:id/audio` | 拉成品音频 URL |
| GET | `/api/projects/:id/subtitle?format=srt\|vtt` | 拉字幕 |
| GET | `/api/projects/:id/export?format=zip\|mp3\|...` | 多格式导出 |
| GET | `/api/projects` | 历史播客列表（登录用户） |
| WS | `/ws/progress?projectId=...` | 进度推送 |

### 3.3 统一响应格式

```typescript
// 成功
{ "code": 0, "data": T, "message": "ok", "traceId": "uuid" }
// 失败
{ "code": 10001, "data": null, "message": "ISBN 格式错误", "traceId": "uuid" }
```

### 3.4 错误码规范

| 范围 | 模块 | 说明 |
|------|------|------|
| 0 | - | 成功 |
| 1xxx | 通用 | 10001 参数错误 / 10002 未授权 / 10003 禁止 / 10004 资源不存在 / 10005 限流 |
| 2xxx | 用户 | 20001 邮箱已注册 / 20002 密码错误 / 20003 token 过期 |
| 3xxx | ISBN/图书 | 30001 ISBN 格式非法 / 30002 元数据抓取失败 / 30003 重试超限 |
| 4xxx | 脚本/AI | 40001 LLM 调用失败 / 40002 脚本超长/过短 / 40003 内容合规拒绝 |
| 5xxx | TTS | 50001 音色不存在 / 50002 合成失败 / 50003 试听超限 |
| 6xxx | 任务 | 60001 任务不存在 / 60002 任务已结束 / 60003 取消失败 |
| 9xxx | 系统 | 90001 内部错误 / 90002 第三方超时 / 90003 存储失败 |

---

## 4. 程序调用流程

### 4.1 端到端时序图：生成一期播客

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant FE as Frontend (React)
    participant API as Backend (NestJS)
    participant Q as BullMQ + Redis
    participant W as WebSocket Gateway
    participant BK as BookApiAdapter
    participant LL as LlmAdapter
    participant TT as TtsAdapter
    participant ST as Storage (MinIO)
    participant FX as ffmpeg worker

    U->>FE: 输入 ISBN 列表,点"导入"
    FE->>FE: ISBN 正则校验 (isbn.ts)
    FE->>API: POST /api/books/metadata {isbns}
    API->>Q: enqueueMetadata(isbns, jobId)
    Q-->>API: 任务ID
    API-->>FE: {code:0, data:{jobId}}
    Q->>BK: 拉取元数据 (适配器路由)
    BK-->>Q: BookMetadata[]
    Q->>API: 写库 ProjectBook
    Q->>W: emit(projectId, stage=metadata, progress=25)
    W-->>FE: WS push
    FE-->>U: 展示书籍列表

    U->>FE: 选音色 + BGM + 音量 + 渐变
    FE->>API: POST /api/projects {books, voices, bgm}
    API->>API: 持久化 Project + Script(空) + BgmConfig
    API-->>FE: {projectId}

    U->>FE: 点"开始生成"
    FE->>API: POST /api/projects/:id/generate
    API->>Q: enqueueScript(projectId)
    API-->>FE: 202 Accepted

    Q->>LL: generateScript(bookContext, prompt)
    LL-->>Q: ScriptSegment[]
    Q->>API: 写库 Script + ScriptSegment
    Q->>W: emit(stage=script, progress=50)
    W-->>FE: WS push

    Q->>Q: enqueueTts(projectId) 串行入队
    loop 每个 ScriptSegment
        Q->>TT: synthesize(text, voiceId)
        TT-->>Q: audioBuffer
        Q->>ST: put(tts-seg-{idx}.mp3)
        Q->>API: 写 AudioFile + 更新 startTime/endTime
    end
    Q->>W: emit(stage=tts, progress=75)
    W-->>FE: WS push

    Q->>Q: enqueueSubtitle(projectId)
    Q->>API: 读 ScriptSegment 的 startTime/endTime
    Q->>ST: put(srt, vtt)
    Q->>W: emit(stage=subtitle, progress=90)
    W-->>FE: WS push

    Q->>Q: enqueueMix(projectId)
    Q->>ST: get(tts-segs) + get(bgm-intro/body/outro)
    Q->>FX: 拼接TTS,叠加BGM,渐入渐出,峰值-3dB
    FX-->>Q: full-mix.mp3
    Q->>ST: put(full-mix.mp3)
    Q->>API: 写 AudioFile(mix_full)
    Q->>W: emit(stage=mix, progress=100)
    W-->>FE: WS push

    FE-->>U: 自动跳"预览&导出页"
    U->>FE: 播放/编辑脚本/导出
    FE->>API: GET /api/projects/:id
    API-->>FE: 完整成品
    FE->>API: GET /api/projects/:id/export?format=zip
    API->>ST: getSignedUrl
    API-->>FE: 302 redirect
    FE-->>U: 浏览器下载
```

### 4.2 关键场景：脚本编辑后重合成

```mermaid
sequenceDiagram
    participant U as 用户
    participant FE as Frontend
    participant API as Backend
    participant Q as BullMQ
    participant W as WS

    U->>FE: 编辑脚本 (TipTap)
    FE->>FE: 5s 防抖
    FE->>API: PUT /api/projects/:id/script
    API->>API: 持久化 Script (新版本号)
    API-->>FE: ok
    U->>FE: 点"重新合成音频"
    FE->>API: POST /api/projects/:id/regenerate
    API->>Q: enqueueTts(projectId, scriptVersion) 增量
    API->>Q: enqueueSubtitle + enqueueMix 串行
    API-->>FE: 202
    Q->>W: 推送 progress (只推 tts/mix 阶段)
    W-->>FE: 更新进度
    Q-->>API: 完成后更新 AudioFile
    W-->>FE: 推送完成
    FE-->>U: 提示"已重新合成"
```

### 4.3 取消与重试流程

```mermaid
sequenceDiagram
    participant FE
    participant API
    participant Q
    participant Third as 第三方 API

    FE->>API: POST /api/projects/:id/cancel
    API->>Q: BullMQ job.remove() (active/queued 都清)
    Q-->>API: ok
    API->>API: Project.status = cancelled, 保留中间产物
    API-->>FE: ok
    Note over FE,Q: 已生成的 Script/TTS 片段保留
    FE->>U: Snackbar "已取消,草稿已保存"

    Note over FE,Third: 重试路径(以元数据为例)
    FE->>API: POST /api/books/metadata {isbns} (重试按钮)
    API->>Q: 重新入队 (attempts=3, backoff=exponential)
    Q->>Third: 第 1 次失败 → 等待 2s → 第 2 次 → 4s → 第 3 次
    Third-->>Q: 成功
    Q-->>API: 写库
```

### 4.4 数据模型 ER 图

```mermaid
erDiagram
    USERS ||--o{ PROJECTS : owns
    USERS ||--o{ USER_PREFERENCES : has
    PROJECTS ||--o{ PROJECT_BOOKS : contains
    PROJECTS ||--|| SCRIPTS : has
    PROJECTS ||--o{ AUDIO_FILES : produces
    PROJECTS ||--o{ SUBTITLE_FILES : produces
    PROJECTS ||--o{ VOICE_CONFIGS : configures
    PROJECTS ||--o{ BGM_CONFIGS : configures
    PROJECTS ||--o{ JOBS : tracks
    SCRIPTS ||--o{ SCRIPT_SEGMENTS : contains
    BGM_CONFIGS }o--|| BGM_TRACKS : uses

    USERS {
        uuid id PK
        string email UK
        string phone UK
        string password_hash
        string nickname
        string avatar_url
        timestamp created_at
    }
    PROJECTS {
        uuid id PK
        uuid user_id FK
        string title
        string mode
        string status
        int progress
        string current_stage
        timestamp created_at
    }
    PROJECT_BOOKS {
        uuid id PK
        uuid project_id FK
        string isbn
        string title
        string author
        string cover_url
        text summary
        int order_index
    }
    SCRIPTS {
        uuid id PK
        uuid project_id FK
        int version
        jsonb content
        text raw_text
        int word_count
    }
    SCRIPT_SEGMENTS {
        uuid id PK
        uuid script_id FK
        int order_index
        string speaker
        text text
        string emotion
        string stage
        int start_time
        int end_time
    }
    AUDIO_FILES {
        uuid id PK
        uuid project_id FK
        string type
        string storage_key
        string format
        int duration_ms
        bigint size_bytes
    }
    SUBTITLE_FILES {
        uuid id PK
        uuid project_id FK
        string format
        text content
        string storage_key
    }
    BGM_TRACKS {
        uuid id PK
        string name
        string category
        string storage_key
        int duration_ms
    }
    BGM_CONFIGS {
        uuid id PK
        uuid project_id FK
        string segment
        uuid bgm_track_id FK
        int volume
        int fade_in_ms
        int fade_out_ms
    }
    VOICE_CONFIGS {
        uuid id PK
        uuid project_id FK
        string role
        string voice_id
        string provider
    }
    JOBS {
        uuid id PK
        uuid project_id FK
        string type
        string status
        int progress
        jsonb payload
        text error
        timestamp created_at
        timestamp finished_at
    }
    USER_PREFERENCES {
        uuid id PK
        uuid user_id FK
        string key
        jsonb value
    }
```

---

## 5. 待明确事项（决策与默认值）

> 我已为以下 10 个 PRD Open Question 给出建议默认值，请主理人在收到本文档后 24h 内确认或推翻。

| # | 问题 | **我的建议默认** | 理由 |
|---|------|----------------|------|
| 1 | 后端语言 | **Node.js (NestJS)** | 与前端同语言；PRD 5/6 决策已倾向；BullMQ 生态最佳 |
| 2a | 图书 API | **Open Library 主 + Google Books 备**（豆瓣暂不接） | 豆瓣反爬严、稳定性差；Open Library 免费、英文数据好；Google Books 备援覆盖中文 |
| 2b | TTS | **火山引擎 TTS 主（中文音色丰富）+ Azure TTS 备** | 火山音色 50+，中文最自然；Azure 备援稳定英文 |
| 2c | 大模型 | **豆包 Doubao-Pro-32k 唯一** | 多模型切换暂不实现，避免提示词/格式碎片化；后续可加 DeepSeek |
| 3 | 登录方式 | **邮箱 + 密码**（v1 唯一方式），第三方登录留 OAuth 扩展点 | MVP 阶段减少攻击面；OAuth 接口预留 |
| 4 | 文件存储 | **MinIO 本地开发 + 阿里云 OSS 生产**（PRD 推荐） | S3 兼容切换零成本；OSS 走 CDN 加速 |
| 5 | 生成超时 | **单期 ≤ 15 分钟**（约 18000 字 / 180 段），超时强制失败 + 草稿保留 | 防止大模型跑飞；UX 上有明确边界 |
| 6 | 数据保留 | **登录用户项目永久保留（用户主动删除为准）**；**30 天未访问的音频文件归档冷存储** | GDPR 留接口；冷存储降本 |
| 7 | 合并模式逻辑 | **AI 按 ISBN 顺序串讲，每本书为一个"章"，章首有引子、章末有过渡** | 比"跨书主题"更可控；用户可预期 |
| 8 | PDF 脚本格式 | **含三栏：左 speaker 头像 / 中 文本 / 右 情绪标签 + 背景音标记** | 模拟真实剧本，对剪辑师友好 |
| 9 | 并发限额 | **游客 1 任务/账号；登录免费 3 任务/账号**（付费留接口） | 防止滥用；MVP 足够 |
| 10 | 国际化 | **v1 仅中文，i18next 框架预留，资源文件就位** | 工时控制；P2 项可后续激活 |

### 5.1 额外假设（请确认）

- **A1**：单期播客总字数 1500~3000（PRD 已定），单本合并模式可放宽到 4500 字。
- **A2**：MP3 码率 192kbps / 44.1kHz，文件大小单期约 15~30MB，PRD 提到 "单文件 > 50MB 提示"——我把这个阈值保留为 50MB。
- **A3**：脚本保存草稿间隔 5s（前端防抖），云端同步走 `PUT /scripts` debounce 5s。
- **A4**：试听音色前端直接调 `POST /tts/preview`（≤10s 文案），不消耗任务配额。
- **A5**：游客生成的成品 24h 后清理（仅留元数据 + 脚本）；登录用户无此限制。
- **A6**：暂不支持自定义音色上传，全部用预设音色（P0-05 要求 ≥4 种，预置 6 种）。
- **A7**：响应式断点遵循 Tailwind 默认（sm 640 / md 768 / lg 1024 / xl 1280）；移动端单列 + 抽屉。
- **A8**：错误日志落地 PG `error_logs` 表（与 Jobs 解耦），包含 trace_id、阶段、堆栈。
- **A9**：CDN 配置：生产环境音频走 OSS + CDN 签名 URL（7 天有效，分享链接用此能力，P2-04 预留）。
- **A10**：测试覆盖率目标：后端 ≥ 60%（关键路径 100%），前端 ≥ 50%（页面 + 组件单测为主）。

---

# Part B：任务分解

## 6. 必需依赖包

### 6.1 Frontend (`frontend/package.json`)

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "@mui/material": "^5.16.7",
    "@mui/icons-material": "^5.16.7",
    "@emotion/react": "^11.13.0",
    "@emotion/styled": "^11.13.0",
    "zustand": "^4.5.4",
    "axios": "^1.7.4",
    "axios-retry": "^4.4.0",
    "socket.io-client": "^4.7.5",
    "wavesurfer.js": "^7.8.0",
    "@tiptap/react": "^2.6.6",
    "@tiptap/starter-kit": "^2.6.6",
    "@tiptap/extension-placeholder": "^2.6.6",
    "i18next": "^23.13.0",
    "react-i18next": "^15.0.2",
    "dayjs": "^1.11.13",
    "clsx": "^2.1.1"
  },
  "devDependencies": {
    "vite": "^5.4.1",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.4",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "tailwindcss": "^3.4.10",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.41",
    "vitest": "^2.0.5",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "eslint": "^9.9.0",
    "prettier": "^3.3.3"
  }
}
```

### 6.2 Backend (`backend/package.json`)

```json
{
  "dependencies": {
    "@nestjs/common": "^10.4.4",
    "@nestjs/core": "^10.4.4",
    "@nestjs/platform-express": "^10.4.4",
    "@nestjs/platform-socket.io": "^10.4.4",
    "@nestjs/websockets": "^10.4.4",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/config": "^3.2.3",
    "@nestjs/throttler": "^6.2.1",
    "@prisma/client": "^5.18.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "bcryptjs": "^2.4.3",
    "class-validator": "^0.14.1",
    "class-transformer": "^0.5.1",
    "bullmq": "^5.12.0",
    "ioredis": "^5.4.1",
    "axios": "^1.7.4",
    "axios-retry": "^4.4.0",
    "fluent-ffmpeg": "^2.1.3",
    "minio": "^8.0.1",
    "ali-oss": "^6.20.0",
    "archiver": "^7.0.1",
    "pdfkit": "^0.15.0",
    "nanoid": "^5.0.7",
    "pino": "^9.3.2",
    "nestjs-pino": "^4.1.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/testing": "^10.4.4",
    "@types/express": "^4.17.21",
    "@types/node": "^20.15.0",
    "@types/bcryptjs": "^2.4.6",
    "@types/fluent-ffmpeg": "^2.1.24",
    "@types/passport-jwt": "^4.0.1",
    "@types/pdfkit": "^0.13.4",
    "@types/archiver": "^6.0.2",
    "typescript": "^5.5.4",
    "prisma": "^5.18.0",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.4",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0"
  }
}
```

### 6.3 Root / Infra

- **Docker Compose 服务**：postgres:15-alpine, redis:7-alpine, minio:latest, backend, frontend（nginx）
- **Node.js**：20.x LTS
- **pnpm**：9.x（workspace 加速）

---

## 7. 任务列表（按依赖排序，共 5 个）

> **硬性约束**：≤ 5 个任务；每任务 ≥ 3 个相关文件；T01 必须是项目基础设施。

### T01: 项目基础设施（Project Infrastructure）

| 项 | 内容 |
|----|------|
| **任务 ID** | T01 |
| **优先级** | P0 |
| **依赖** | 无 |
| **预估工时** | 6 工时（约 1 个工程师日） |
| **目标** | 一键 `pnpm i && docker compose up` 起 PG/Redis/MinIO/前端/后端，看到空白应用 + 健康检查 200 |

**Source Files**：
- `package.json`（monorepo workspaces 根，含 `frontend` / `backend` / `shared` workspace）
- `pnpm-workspace.yaml`
- `docker-compose.yml`（pg / redis / minio / backend / frontend + 自动 init-db.sh）
- `.env.example`（全部环境变量，README 中列出说明）
- `.gitignore` / `.editorconfig` / `.prettierrc` / `eslint.config.js`
- `README.md`（启动命令、目录结构、贡献指南）
- `frontend/package.json` + `frontend/vite.config.ts` + `frontend/tsconfig.json` + `frontend/tailwind.config.ts` + `frontend/postcss.config.js` + `frontend/index.html`
- `frontend/src/main.tsx` + `frontend/src/App.tsx` + `frontend/src/index.css`（含 Tailwind 指令）
- `backend/package.json` + `backend/tsconfig.json` + `backend/nest-cli.json`
- `backend/src/main.ts`（bootstrap，含 CORS、Helmet、ValidationPipe、端口 3001）
- `backend/src/app.module.ts`（导入 ConfigModule，根模块）
- `backend/src/health/health.controller.ts`（`GET /health` 返回 `{status:'ok'}`）
- `infra/docker/backend.Dockerfile` + `infra/docker/frontend.Dockerfile` + `infra/docker/nginx.conf`
- `infra/scripts/init-db.sh` + `infra/scripts/seed.sh`
- `docs/architecture.md`（本文件副本）+ `docs/api-contract.md`（API 契约骨架）

**验收标准**：
- [ ] `pnpm i` 在根目录可一次性装完前后端
- [ ] `docker compose up -d` 启动 PG(5432) + Redis(6379) + MinIO(9000/9001) + backend(3001) + frontend(5173)
- [ ] `curl http://localhost:3001/health` 返回 `{"status":"ok"}`
- [ ] 浏览器打开 `http://localhost:5173` 看到 "Podcast Platform" 占位页 + 步骤指示器
- [ ] `frontend/.env.example` 与 `backend/.env.example` 列出所有变量，README 有说明
- [ ] Prisma Client 可生成（即使 schema 为空）

---

### T02: 后端核心 —— 数据模型 + 认证 + 基础 CRUD

| 项 | 内容 |
|----|------|
| **任务 ID** | T02 |
| **优先级** | P0 |
| **依赖** | T01 |
| **预估工时** | 14 工时（约 2 个工程师日） |
| **目标** | 数据库 schema 落库、用户注册/登录/JWT 鉴权、Project 完整 CRUD、错误码统一 |

**Source Files**：
- `backend/src/prisma/schema.prisma`（按 4.4 ER 图全部表 + index + FK）
- `backend/src/prisma/prisma.module.ts` + `backend/src/prisma/prisma.service.ts`
- `backend/src/config/configuration.ts` + `database.config.ts` + `redis.config.ts` + `storage.config.ts` + `third-party.config.ts`
- `backend/src/common/filters/http-exception.filter.ts`（统一错误格式）
- `backend/src/common/interceptors/response.interceptor.ts`（统一响应 `{code,data,message,traceId}`）
- `backend/src/common/guards/jwt-auth.guard.ts` + `backend/src/common/decorators/current-user.decorator.ts`
- `backend/src/common/dto/pagination.dto.ts` + `api-response.dto.ts`
- `backend/src/modules/auth/auth.module.ts` + `auth.controller.ts` + `auth.service.ts` + `jwt.strategy.ts`
- `backend/src/modules/auth/dto/login.dto.ts` + `register.dto.ts`
- `backend/src/modules/user/user.module.ts` + `user.service.ts` + `user.repository.ts`
- `backend/src/modules/project/project.module.ts` + `project.controller.ts` + `project.service.ts` + `project.repository.ts`
- `backend/src/modules/project/dto/create-project.dto.ts` + `update-config.dto.ts` + `project.dto.ts`
- `shared/types/api.ts` + `user.ts` + `project.ts`（前后端共享 TS 类型）
- `backend/test/auth.e2e-spec.ts` + `project.e2e-spec.ts`（基础 happy path）

**验收标准**：
- [ ] `pnpm prisma migrate dev` 成功生成全部表
- [ ] `POST /api/auth/register` 邮箱密码注册成功，密码 bcrypt 哈希存储
- [ ] `POST /api/auth/login` 返回 access_token(15min) + refresh_token(7d)
- [ ] `GET /api/auth/me` 带 Bearer token 返回用户信息
- [ ] `POST /api/projects` 创项目（含 books/voices/bgm 嵌套）→ 401/200/400 错误码正确
- [ ] `GET /api/projects/:id`、`PATCH`、`GET /api/projects`（分页）均通过
- [ ] 所有失败响应符合 `{code,data:null,message,traceId}` 格式，错误码在 1xxx~9xxx 范围
- [ ] 单元测试：`auth.service` / `project.service` 覆盖率 ≥ 60%
- [ ] E2E 测试：注册→登录→创建项目→拉取详情 全链路通过

---

### T03: 后端适配器层 + 异步任务队列 + WebSocket

| 项 | 内容 |
|----|------|
| **任务 ID** | T03 |
| **优先级** | P0 |
| **依赖** | T02 |
| **预估工时** | 18 工时（约 2.5 个工程师日） |
| **目标** | 第三方 API 全打通，BullMQ 4 队列跑通 metadata→script→tts→subtitle→mix，前端可订阅 WS 进度 |

**Source Files**：
- `backend/src/modules/book/book.module.ts` + `book.controller.ts` + `book.service.ts`
- `backend/src/modules/book/adapters/book-api.adapter.ts`（interface）
- `backend/src/modules/book/adapters/open-library.adapter.ts`（主，含 5min 内存缓存）
- `backend/src/modules/book/adapters/google-books.adapter.ts`（备）
- `backend/src/modules/book/dto/fetch-metadata.dto.ts` + `book.dto.ts`
- `backend/src/modules/script/script.module.ts` + `script.controller.ts` + `script.service.ts`
- `backend/src/modules/script/adapters/llm.adapter.ts`（interface）
- `backend/src/modules/script/adapters/doubao.adapter.ts`（六段式 + 合并模式 prompt）
- `backend/src/modules/script/prompts/six-segment.template.ts` + `merge-mode.template.ts`
- `backend/src/modules/script/dto/script.dto.ts`
- `backend/src/modules/tts/tts.module.ts` + `tts.controller.ts` + `tts.service.ts`
- `backend/src/modules/tts/adapters/tts.adapter.ts`（interface）
- `backend/src/modules/tts/adapters/volcengine.adapter.ts`（主，WebSocket streaming 协议）
- `backend/src/modules/tts/adapters/azure.adapter.ts`（备）
- `backend/src/modules/tts/dto/tts-voice.dto.ts`
- `backend/src/modules/bgm/bgm.module.ts` + `bgm.controller.ts` + `bgm.service.ts` + `bgm.seed.ts`（预置 12 首）
- `backend/src/modules/subtitle/subtitle.module.ts` + `subtitle.service.ts` + `srt.generator.ts` + `vtt.generator.ts`
- `backend/src/modules/mix/mix.module.ts` + `mix.service.ts` + `ffmpeg.util.ts` + `mix.processor.ts`（拼接+渐变+峰值限制）
- `backend/src/modules/storage/storage.module.ts` + `storage.service.ts`
- `backend/src/modules/storage/adapters/storage.adapter.ts`（interface）
- `backend/src/modules/storage/adapters/minio.adapter.ts` + `oss.adapter.ts`
- `backend/src/modules/queue/queue.module.ts` + `queue.service.ts` + `constants.ts`（4 队列名）
- `backend/src/modules/queue/processors/metadata.processor.ts`（attempts=3, backoff=expo）
- `backend/src/modules/queue/processors/script.processor.ts`（串行触发 tts）
- `backend/src/modules/queue/processors/tts.processor.ts`（每段并发 4 + 串行触发 subtitle）
- `backend/src/modules/queue/processors/subtitle.processor.ts`（触发 mix）
- `backend/src/modules/queue/processors/mix.processor.ts`（最终阶段）
- `backend/src/modules/ws/ws.module.ts` + `progress.gateway.ts`（Socket.IO，按 projectId 房间）
- `backend/src/modules/ws/progress-event.dto.ts`
- `backend/src/modules/export/export.module.ts` + `export.controller.ts` + `export.service.ts`（zip/pdf）
- `backend/src/modules/export/pdf.generator.ts`（PDFKit 三栏剧本）
- `backend/src/modules/export/zip.packager.ts`（archiver）
- `shared/types/book.ts` + `script.ts` + `job.ts`（前后端共享）
- `backend/test/book-adapter.spec.ts` + `script-adapter.spec.ts` + `mix.service.spec.ts`（含 ffmpeg 集成测试）

**验收标准**：
- [ ] 真实 ISBN 走 Open Library 5s 内拉回元数据；主备切换手动可配
- [ ] LLM 生成 1500~3000 字六段式 JSON，结构与 PRD §3.3 一致
- [ ] TTS 4+ 音色试听可用；1500 字脚本合成 < 90s
- [ ] BGM 12 首入库（4 类 × 3 首），`GET /api/bgm/tracks` 返回
- [ ] SRT/VTT 字幕时间轴与 TTS 段对齐误差 < 200ms
- [ ] ffmpeg 混音：BGM 渐入 1s/2s 验证，峰值 ≤ -3dB
- [ ] 端到端：创建项目→启动生成→4 阶段进度推送→最终 MP3 落 MinIO 全成
- [ ] `POST /api/projects/:id/cancel` 中止所有相关 BullMQ job，状态写 cancelled
- [ ] 失败重试：手动 kill redis 后再启，自动从断点续做

---

### T04: 前端基础设施 + 状态管理 + API/WS 客户端

| 项 | 内容 |
|----|------|
| **任务 ID** | T04 |
| **优先级** | P0 |
| **依赖** | T01（前端部分） |
| **预估工时** | 10 工时（约 1.5 个工程师日） |
| **目标** | 前端能登录、路由通、Axios 拦截器带 token + 重试 3 次、WS 客户端能订阅进度、Zustand stores 完整、登录态持久化游客/云端双模式 |

**Source Files**：
- `frontend/src/api/client.ts`（axios 实例 + interceptors + axios-retry + traceId 注入）
- `frontend/src/api/auth.api.ts` + `frontend/src/api/book.api.ts` + `frontend/src/api/project.api.ts` + `frontend/src/api/tts.api.ts` + `frontend/src/api/bgm.api.ts` + `frontend/src/api/export.api.ts` + `frontend/src/api/script.api.ts`
- `frontend/src/ws/socket.ts`（Socket.IO client，房间订阅，断线重连）
- `frontend/src/store/user.store.ts`（JWT 持久化、refresh 逻辑、登录态）
- `frontend/src/store/project.store.ts`（当前项目 + 草稿 debounce 自动保存）
- `frontend/src/store/books.store.ts`（ISBN 列表 + 元数据 + 失败重试）
- `frontend/src/store/config.store.ts`（音色/BGM/音量/渐变，登录用户同步云端）
- `frontend/src/store/progress.store.ts`（WS 接收的进度，4 阶段枚举）
- `frontend/src/store/ui.store.ts`（Snackbar 全局队列）
- `frontend/src/storage/storage.interface.ts` + `local-storage.adapter.ts`
- `frontend/src/hooks/useApi.ts`（泛型封装 loading/error/data） + `useProgress.ts` + `useDebounce.ts` + `useMediaQuery.ts`
- `frontend/src/components/layout/AppHeader.tsx` + `AppFooter.tsx` + `StepIndicator.tsx` + `MobileDrawer.tsx`
- `frontend/src/components/feedback/SnackbarProvider.tsx`（全局 Snackbar） + `LoadingButton.tsx` + `ErrorBoundary.tsx` + `EmptyState.tsx`
- `frontend/src/pages/Auth/LoginPage.tsx` + `RegisterPage.tsx`
- `frontend/src/types/api.ts` + `user.ts` + `project.ts` + `book.ts`（re-export from shared）
- `frontend/src/utils/logger.ts` + `format.ts` + `download.ts`
- `frontend/src/constants/env.ts`（读 VITE_API_BASE_URL 等）
- `frontend/src/i18n/index.ts`（i18next 初始化）+ `zh-CN.json` + `en-US.json`（资源文件就位，默认中文）
- `frontend/src/main.tsx`（注入 SnackbarProvider、ErrorBoundary、Router、Theme）
- `frontend/src/App.tsx`（路由表：4 步 + Auth + 404）

**验收标准**：
- [ ] 浏览器 `http://localhost:5173` 路由可跳 4 步 + 登录/注册
- [ ] 登录后 JWT 存 localStorage，刷新仍登录
- [ ] 游客模式下，books/config 状态走 localStorage；登录后调 `POST /api/projects/sync` 合并
- [ ] Axios 拦截器：401 自动 refresh 一次，refresh 失败跳登录
- [ ] 任意 API 失败 3 次自动重试（指数退避），最终失败抛 Snackbar
- [ ] WS 客户端：连接、断线重连、订阅 projectId 房间、关闭组件 unsubscribe
- [ ] Zustand stores 单元测试覆盖主要 action
- [ ] 移动端 < 768px：顶部抽屉菜单 + 单列布局 + 底部固定"下一步"按钮

---

### T05: 前端四步页面 + 播放/编辑器/导出

| 项 | 内容 |
|----|------|
| **任务 ID** | T05 |
| **优先级** | P0 |
| **依赖** | T03 + T04 |
| **预估工时** | 16 工时（约 2 个工程师日） |
| **目标** | 端到端流程跑通：ISBN 导入→选音色/BGM→生成看进度→预览播放+波形+字幕+编辑→6 种导出格式 |

**Source Files**：

**Page 1 选书**：
- `frontend/src/pages/BookSelectPage.tsx`
- `frontend/src/features/book-select/IsbnInput.tsx`（多行/粘贴，正则校验，错误行红色高亮）
- `frontend/src/features/book-select/ModeSelector.tsx`（独立/合并单选）
- `frontend/src/features/book-select/BookListItem.tsx`（封面缩略图 + 重试按钮 + 删除）

**Page 2 配置**：
- `frontend/src/pages/ConfigPage.tsx`
- `frontend/src/features/config/VoiceSelector.tsx`（主持人/嘉宾两组，每组 ≥4 音色 + 试听）
- `frontend/src/features/config/VoicePreviewPlayer.tsx`（调用 `/tts/preview`）
- `frontend/src/features/config/BgmSegmentConfig.tsx`（开场/正片/片尾三段）
- `frontend/src/features/config/VolumeSlider.tsx`（0~100，含 dB 提示）
- `frontend/src/features/config/FadeSelector.tsx`（0.5s/1s/2s 选项）

**Page 3 生成**：
- `frontend/src/pages/GeneratingPage.tsx`
- `frontend/src/features/generating/ProgressBar.tsx`（MUI LinearProgress + 百分比）
- `frontend/src/features/generating/StageList.tsx`（4 阶段勾选 + 当前阶段高亮）
- `frontend/src/features/generating/CancelDialog.tsx`（确认取消）

**Page 4 预览&导出**：
- `frontend/src/pages/PreviewExportPage.tsx`
- `frontend/src/components/player/AudioPlayer.tsx`（HTMLAudio + 控制条 + 音量）
- `frontend/src/components/player/Waveform.tsx`（wavesurfer.js，点击跳转）
- `frontend/src/components/player/SubtitleOverlay.tsx`（高亮当前 cue + 点击跳转 + 字号调节）
- `frontend/src/components/player/PlaybackControls.tsx`
- `frontend/src/components/editor/ScriptEditor.tsx`（TipTap，5s debounce 自动保存）
- `frontend/src/components/editor/SegmentNode.tsx`（自定义节点：speaker/emotion）
- `frontend/src/features/preview-export/ScriptPanel.tsx` + `ExportPanel.tsx` + `RegenerateButton.tsx`
- `frontend/src/utils/isbn.ts`（10/13 位校验、校验位算法）
- `frontend/src/constants/voices.ts`（音色元数据常量，登录用户最近 5 个置顶）
- `frontend/src/constants/emotions.ts`（情绪枚举 + 默认 emoji）

**验收标准**：
- [ ] Page 1：粘贴 5 个 ISBN（含 1 个非法）→ 合法绿色、非法红色悬停显示原因 → 调后端 → 5 卡片展示
- [ ] Page 2：选 2 音色 + 3 BGM + 滑音量 → 实时调 `useApi('PUT /api/projects/:id')`
- [ ] Page 3：点"开始生成" → 进度条 0→100% 平滑，4 阶段勾选依次激活；可中途取消
- [ ] Page 4：自动播放，波形渲染 < 2s，字幕随播放高亮，点击波形/字幕跳转 < 1s 误差
- [ ] 编辑脚本 → 5s 后"重新合成"置为可点击 → 触发 `/regenerate`
- [ ] 6 种导出：MP3 / SRT / VTT / TXT / PDF / 全部 ZIP 按钮均可下载
- [ ] 移动端：4 步流程在 < 768px 单列展示，所有交互可点
- [ ] Snackbar：成功绿、失败红、3s 自动消失
- [ ] 端到端冒烟测试：游客/登录两条路径，从导入到下载 ZIP 全通过

---

## 8. 共享知识（跨文件约定，工程师必读）

### 8.1 命名规范

| 类别 | 规范 | 示例 |
|------|------|------|
| 文件名 | kebab-case（前端组件首字母大写 PascalCase） | `book-select-page.tsx`, `BookSelectPage.tsx` |
| 目录名 | kebab-case | `book-select/` |
| 类名 | PascalCase | `BookService` |
| 接口/类型 | PascalCase | `BookMetadata` |
| 变量/函数 | camelCase | `fetchMetadata` |
| 常量 | SCREAMING_SNAKE | `MAX_RETRY_COUNT` |
| 数据库表 | snake_case 复数 | `project_books` |
| 字段 | snake_case | `created_at` |
| API 路径 | kebab-case 复数 | `/api/projects/:id/scripts` |
| 环境变量 | SCREAMING_SNAKE + 分类前缀 | `DATABASE_URL`, `REDIS_HOST`, `OSS_ACCESS_KEY` |
| 错误码 | 数字区间 | `10001` ~ `90003` |
| 队列名 | 冒号分隔 | `podcast:metadata`, `podcast:script` |
| WS 事件 | 点分隔 | `project.progress` |
| BullMQ Job ID | 业务前缀 | `meta-{projectId}` |

### 8.2 前后端共享类型（`shared/types/`）

> 所有跨端数据结构必须从 `shared/types/` 导入，前后端引用同一文件（monorepo symlink）。新增类型先在 shared 定义。

### 8.3 状态机

| Project.status | 触发动作 | 终态 |
|----------------|----------|------|
| draft | 用户保存配置 | — |
| generating | `POST /:id/generate` 成功 | 流转 |
| done | mix 阶段完成 | 终态 |
| failed | 任一阶段重试 3 次仍失败 | 终态 |
| cancelled | `POST /:id/cancel` 成功 | 终态 |
| partial | cancel 时已有部分产物 | 终态 |

### 8.4 进度事件（WebSocket）

```typescript
// 推送给客户端的事件格式
{
  type: 'project.progress',
  projectId: 'uuid',
  stage: 'metadata' | 'script' | 'tts' | 'subtitle' | 'mix',
  progress: 0~100,
  message: '正在合成第 5/40 段 TTS',
  timestamp: 1718300000000,
  traceId: 'uuid'
}
```

### 8.5 异常与重试约定

- **前端**：Axios 拦截器对 `5xx` 和 `network error` 自动重试 3 次（指数退避 1s/2s/4s），4xx 不重试。
- **后端 BullMQ**：默认 `attempts=3, backoff={type:'exponential', delay:2000}`；致命错误（参数错）`attempts=1`。
- **TTS 单段失败**：仅该段标红，不影响整期；用户可单独重试。
- **脚本/混音失败**：整期失败，写入 `error_logs`，状态 `failed`，前端 Snackbar + 重试按钮。

### 8.6 时间与单位

- **时间戳**：DB 存 `TIMESTAMPTZ` (UTC)；前端展示用 `dayjs().format()`。
- **时长**：所有 ms（毫秒整数），前端展示用 `mm:ss`。
- **音量**：0~100 整数；后端转 0.0~1.0 浮点给 ffmpeg。
- **渐变**：ms（500/1000/2000）。

### 8.7 安全与限流

- **CORS**：白名单前端域名。
- **限流**：登录 60 req/min，游客 20 req/min（`@nestjs/throttler`）。
- **JWT**：HS256，access 15min，refresh 7d，refresh 走 httpOnly cookie（前端用 `withCredentials`）。
- **ISBN 校验**：前端 + 后端双重校验（前端 ISBN-10/13 校验位算法，后端再用正则兜底）。
- **存储签名 URL**：默认 1h 过期；分享链接场景 7d。

### 8.8 环境变量清单（`.env.example`）

```
# Backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/podcast
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
JWT_SECRET=change-me
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=podcast
OSS_ACCESS_KEY=
OSS_SECRET_KEY=
OSS_BUCKET=
OSS_REGION=
OSS_CDN_DOMAIN=
DOUBAO_API_KEY=
DOUBAO_ENDPOINT=https://ark.cn-beijing.volces.com/api/v3
DOUBAO_MODEL=doubao-pro-32k
VOLC_TTS_APP_ID=
VOLC_TTS_TOKEN=
AZURE_TTS_KEY=
AZURE_TTS_REGION=
OPENLIBRARY_BASE=https://openlibrary.org
GOOGLE_BOOKS_BASE=https://www.googleapis.com/books/v1
PORT=3001
LOG_LEVEL=info
CORS_ORIGINS=http://localhost:5173
MAX_RETRY=3
MAX_BOOKS_PER_PROJECT=20
MAX_SCRIPT_WORDS=3000
MAX_SCRIPT_DURATION_MS=900000
```

```
# Frontend
VITE_API_BASE_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
VITE_DEFAULT_LANG=zh-CN
VITE_MAX_BOOKS=20
```

### 8.9 提交与代码审查

- **分支策略**：Trunk-based；`main` 受保护，PR 合并。
- **提交规范**：Conventional Commits（`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`）。
- **PR 检查**：ESLint + Prettier + Jest/Vitest + TypeScript strict mode（`"strict": true`）。
- **Code Owner**：架构师 Bob 审 `architecture/`，主理人审最终合入。

### 8.10 关键不变量（Engineer must not break）

1. 任何 `Project.status` 变更必须**先写库再发 WS**（避免 UI 状态超前于 DB）。
2. BullMQ job 失败重试**不能重复扣费第三方 API**（用 idempotencyKey + adapter 内部去重）。
3. TTS 段必须在 `AudioFile.storage_key` 写入 MinIO 后**才更新 startTime/endTime**（避免字幕指向空文件）。
4. WebSocket 推送必须携带 `traceId`（与请求 ID 同源，方便排错）。
5. ffmpeg 混音输出**必须**用 `-filter:a "volume=0.5,afade=in:st=0:d=1,afade=out"` 等结构化滤镜（不写临时文件，pipeline 一次跑完）。

---

## 9. 任务依赖图

```mermaid
graph TD
    T01["T01 项目基础设施<br/>6h · P0<br/>(monorepo + docker + 前后端 entry)"]
    T02["T02 后端核心<br/>14h · P0<br/>(Prisma + Auth + Project CRUD)"]
    T03["T03 后端适配器+队列+WS<br/>18h · P0<br/>(4 适配器 + 4 队列 + Socket.IO)"]
    T04["T04 前端基础<br/>10h · P0<br/>(API/WS 客户端 + 5 stores + 登录路由)"]
    T05["T05 前端 4 步页面<br/>16h · P0<br/>(选书/配置/生成/预览&导出)"]

    T02 --> T01
    T03 --> T02
    T04 --> T01
    T05 --> T03
    T05 --> T04

    classDef p0 fill:#fde2e2,stroke:#dc2626,color:#000;
    classDef p1 fill:#fef3c7,stroke:#d97706,color:#000;
    class T01,T02,T03,T04,T05 p0;
```

**关键路径**（最长依赖链）：`T01 → T03 → T05`（共 40 工时）= 后端打通 → 前端页面。
**最短路径**（可并行）：`T01 → T02` 与 `T01 → T04` 可由两位工程师同时开工。

### 9.1 推荐人员排布

| 工程师 | 任务序列 |
|--------|----------|
| 后端 A | T01 (后端部分) → T02 → T03 |
| 前端 B | T01 (前端部分) → T04 → T05 |
| 全栈 C（兼测试） | T05 后期介入，编写 e2e 用例 + 部署文档 |

**总工时**：64 工时（8 人日）= 2 周内 2 人可完成 MVP。

---

## 10. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 火山 TTS 中文音色版权 | 中 | 高 | 备援 Azure；合同确认后再商用 |
| 豆包长上下文脚本质量不稳定 | 中 | 中 | 模板化 prompt + JSON Schema 校验 + 单条重试 |
| ffmpeg 跨平台差异（mac/win/linux） | 中 | 中 | 统一 Docker 镜像，宿主机不直装 |
| BullMQ 队列积压（爆量） | 低 | 中 | Prometheus + 队列长度告警 + 自动扩容 worker |
| 单期超 15 分钟大文件 | 低 | 中 | PRD §5.5 决策：强制失败 + 引导用户拆分 |
| MinIO 容量溢出 | 低 | 中 | 登录用户 30 天冷归档策略 + 容量监控 |
| 豆瓣 API 反爬导致元数据失败 | 高 | 低 | 默认不接豆瓣，PRD §5 默认已排除 |

---

## 11. 后续路线图（MVP 之后）

| 阶段 | 增量 |
|------|------|
| v1.1 | P2-01 多语言（i18next 全量翻译）/ P1-04 偏好记忆置顶 |
| v1.2 | P2-02 脚本模板（深度书评/轻松对谈）/ P2-03 播客封面生成 |
| v1.3 | P2-04 分享链接（7d 有效）/ P2-05 音效素材 |
| v2.0 | 第三方登录（微信/GitHub）/ 付费配额 / SSO / 多租户 |

---

**文档结束。** 落盘路径：`D:\Broadcast\deliverables\software-company\podcast-platform-architecture.md`

请主理人重点确认 §5 待明确事项 10 个默认值与 §0 关键决策 18 项；如需调整请回复具体条目编号，Bob 将于 24h 内出 v1.1。
