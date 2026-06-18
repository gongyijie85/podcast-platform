# Podcast Platform Code Wiki

> 本文档是播客平台项目的完整代码知识库，涵盖项目架构、模块职责、关键类与函数、依赖关系及运行方式。

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈](#2-技术栈)
3. [项目架构](#3-项目架构)
4. [目录结构](#4-目录结构)
5. [核心模块详解](#5-核心模块详解)
6. [数据模型](#6-数据模型)
7. [API 接口](#7-api-接口)
8. [关键类与函数](#8-关键类与函数)
9. [依赖关系](#9-依赖关系)
10. [运行与部署](#10-运行与部署)
11. [开发指南](#11-开发指南)

---

## 1. 项目概述

**Podcast Platform** 是一个 ISBN → AI 播客一站式自动生产平台。

### 核心功能

- **图书元数据获取**：通过 ISBN 批量拉取图书信息（Open Library / Google Books）
- **AI 脚本生成**：使用豆包大模型生成双人对话播客脚本（六段式结构）
- **TTS 语音合成**：支持火山引擎 / Azure TTS，多音色选择
- **音频混音**：TTS 人声 + BGM 背景音乐混流，支持渐入渐出
- **字幕生成**：自动生成 SRT/VTT 字幕，与音频时间轴对齐
- **多格式导出**：MP3 / SRT / VTT / TXT / PDF / ZIP

### 项目定位

"ISBN 批量输入 → 拉元数据 → 豆包生成双人脚本 → TTS 配音 + BGM → 合成 MP3 + SRT/VTT + 字幕波形联动 → 多格式导出" 的一站式 Web 平台。

---

## 2. 技术栈

### 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vite | ^5.4.1 | 构建工具 |
| React | ^18.3.1 | UI 框架 |
| TypeScript | ^5.5.4 | 类型系统 |
| MUI v5 | ^5.16.7 | 组件库 |
| Tailwind CSS | ^3.4.10 | 原子化 CSS |
| Zustand | ^4.5.4 | 状态管理 |
| React Router | ^6.26.0 | 路由 |
| Socket.IO Client | ^4.7.5 | WebSocket 通信 |
| wavesurfer.js | ^7.8.0 | 音频波形可视化 |
| TipTap | ^2.6.6 | 富文本编辑器 |
| Axios | ^1.7.4 | HTTP 客户端 |
| i18next | ^23.13.0 | 国际化 |

### 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| NestJS | ^10.4.4 | 后端框架 |
| Prisma | ^5.18.0 | ORM |
| BullMQ | ^5.12.0 | 任务队列 |
| Socket.IO | ^4.7.5 | WebSocket 服务 |
| Passport + JWT | ^10.2.0 | 认证授权 |
| fluent-ffmpeg | ^2.1.3 | 音频处理 |
| MinIO | ^8.0.1 | 对象存储 |
| Pino | ^9.3.2 | 日志 |

### 存储层

| 组件 | 版本 | 用途 |
|------|------|------|
| PostgreSQL | 15 | 主数据库 |
| Redis | 7 | 队列/缓存 |
| MinIO | latest | 本地对象存储 |
| 阿里云 OSS | - | 生产环境存储 |

---

## 3. 项目架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ BookSel │ │ Config  │ │ Generate│ │ Preview │           │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘           │
│       │           │           │           │                 │
│  ┌────┴───────────┴───────────┴───────────┴────┐            │
│  │           Zustand Stores + API Client        │            │
│  └─────────────────────┬───────────────────────┘            │
└────────────────────────┼────────────────────────────────────┘
                         │ HTTP / WebSocket
┌────────────────────────┼────────────────────────────────────┐
│                    Backend (NestJS)                           │
│  ┌─────────────────────┴───────────────────────┐            │
│  │              Controllers Layer               │            │
│  └─────────────────────┬───────────────────────┘            │
│  ┌─────────────────────┴───────────────────────┐            │
│  │              Services Layer                  │            │
│  └──────┬──────────┬──────────┬────────────────┘            │
│         │          │          │                              │
│  ┌──────┴────┐ ┌───┴────┐ ┌──┴─────┐                       │
│  │ Adapters  │ │ Queue  │ │  WS    │                       │
│  │ (Book/LLM │ │(BullMQ)│ │Gateway │                       │
│  │  TTS/Store)│ │        │ │        │                       │
│  └──────┬────┘ └───┬────┘ └──┬─────┘                       │
│         │          │          │                              │
└─────────┼──────────┼──────────┼──────────────────────────────┘
          │          │          │
┌─────────┴──────────┴──────────┴──────────────────────────────┐
│                    Storage Layer                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │PostgreSQL│  │  Redis  │  │  MinIO  │  │  OSS    │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│         (Controllers, DTOs, Guards, Interceptors)           │
├─────────────────────────────────────────────────────────────┤
│                    Application Layer                         │
│         (Services, Pipeline, Queue Processors)              │
├─────────────────────────────────────────────────────────────┤
│                    Domain Layer                              │
│         (Models, Interfaces, Adapters)                      │
├─────────────────────────────────────────────────────────────┤
│                    Infrastructure Layer                      │
│         (Database, Storage, External APIs)                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 核心流程

```
ISBN 输入 → 元数据拉取 → AI 脚本生成 → TTS 合成 → 字幕生成 → 音频混音 → 导出
    ↓           ↓            ↓           ↓          ↓          ↓         ↓
  前端校验   Open Library   豆包 LLM   火山/Azure  SRT/VTT   ffmpeg    ZIP/PDF
```

---

## 4. 目录结构

```
podcast-platform/
├── README.md                    # 项目说明
├── CHANGELOG.md                 # 变更日志
├── CODE_WIKI.md                 # 本文档
├── docker-compose.yml           # Docker 编排
├── .env.example                 # 环境变量示例
├── package.json                 # Monorepo 根配置
├── pnpm-workspace.yaml          # pnpm 工作空间配置
│
├── frontend/                    # 前端应用
│   ├── src/
│   │   ├── api/                 # API 客户端
│   │   ├── components/          # 通用组件
│   │   ├── features/            # 功能模块
│   │   ├── hooks/               # 自定义 Hooks
│   │   ├── layouts/             # 布局组件
│   │   ├── pages/               # 页面组件
│   │   ├── router/              # 路由配置
│   │   ├── store/               # Zustand 状态
│   │   ├── storage/             # 持久化适配器
│   │   ├── constants/           # 常量定义
│   │   └── i18n/                # 国际化
│   └── package.json
│
├── backend/                     # 后端应用
│   ├── src/
│   │   ├── common/              # 公共模块
│   │   │   ├── decorators/      # 自定义装饰器
│   │   │   ├── dto/             # 数据传输对象
│   │   │   ├── filters/         # 异常过滤器
│   │   │   ├── guards/          # 认证守卫
│   │   │   ├── interceptors/    # 拦截器
│   │   │   └── pipes/           # 管道
│   │   ├── config/              # 配置
│   │   ├── prisma/              # Prisma 模块
│   │   ├── modules/             # 业务模块
│   │   │   ├── auth/            # 认证模块
│   │   │   ├── user/            # 用户模块
│   │   │   ├── project/         # 项目模块
│   │   │   ├── book/            # 图书模块
│   │   │   ├── script/          # 脚本模块
│   │   │   ├── tts/             # TTS 模块
│   │   │   ├── bgm/             # BGM 模块
│   │   │   ├── subtitle/        # 字幕模块
│   │   │   ├── mix/             # 混音模块
│   │   │   ├── storage/         # 存储模块
│   │   │   ├── queue/           # 队列模块
│   │   │   ├── ws/              # WebSocket 模块
│   │   │   ├── export/          # 导出模块
│   │   │   └── pipeline/        # 流水线模块
│   │   └── health/              # 健康检查
│   ├── prisma/
│   │   └── schema.prisma        # 数据库 Schema
│   └── package.json
│
├── shared/                      # 前后端共享类型
│   └── types/
│       ├── api.ts               # API 类型
│       ├── user.ts              # 用户类型
│       ├── project.ts           # 项目类型
│       ├── script.ts            # 脚本类型
│       ├── book.ts              # 图书类型
│       ├── job.ts               # 任务类型
│       └── pipeline.ts          # 流水线类型
│
├── infra/                       # 基础设施
│   ├── docker/
│   │   ├── backend.Dockerfile
│   │   ├── frontend.Dockerfile
│   │   └── nginx.conf
│   └── scripts/
│       ├── init-db.sh
│       └── seed.sh
│
└── scripts/                     # 部署脚本
    ├── verify-deploy.ps1
    └── e2e-online.ps1
```

---

## 5. 核心模块详解

### 5.1 认证模块 (Auth Module)

**路径**: `backend/src/modules/auth/`

**职责**: 用户注册、登录、JWT 令牌管理

**关键文件**:
- `auth.controller.ts` - 认证接口控制器
- `auth.service.ts` - 认证业务逻辑
- `jwt.strategy.ts` - JWT 策略
- `dto/login.dto.ts` - 登录 DTO
- `dto/register.dto.ts` - 注册 DTO

**API 接口**:
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/refresh` - 刷新令牌
- `GET /api/auth/me` - 获取当前用户

**认证流程**:
```
注册 → bcrypt 密码哈希 → 存储用户 → 返回 JWT
登录 → 验证密码 → 生成 access_token(15min) + refresh_token(7d)
请求 → Bearer Token → JwtAuthGuard 验证 → 注入 CurrentUser
```

### 5.2 图书模块 (Book Module)

**路径**: `backend/src/modules/book/`

**职责**: 图书元数据获取与管理

**关键文件**:
- `book.controller.ts` - 图书接口控制器
- `book.service.ts` - 图书业务逻辑
- `adapters/book-api.adapter.ts` - 适配器接口
- `adapters/open-library.adapter.ts` - Open Library 适配器
- `adapters/google-books.adapter.ts` - Google Books 适配器
- `adapters/mock-book-metadata.adapter.ts` - Mock 适配器

**适配器模式**:
```typescript
interface BookApiAdapter {
  fetchByIsbn(isbn: string): Promise<BookMetadata>;
  fetchBatch(isbns: string[]): Promise<BookMetadata[]>;
}
```

**Mock 兜底**: 当 `OPENLIBRARY_BASE` 不可达时，返回 5 本示例书

### 5.3 脚本模块 (Script Module)

**路径**: `backend/src/modules/script/`

**职责**: AI 播客脚本生成

**关键文件**:
- `script.controller.ts` - 脚本接口控制器
- `script.service.ts` - 脚本业务逻辑
- `adapters/llm.adapter.ts` - LLM 适配器接口
- `adapters/doubao.adapter.ts` - 豆包适配器
- `adapters/openai-compatible-llm.adapter.ts` - OpenAI 兼容适配器
- `adapters/mock-script-gen.adapter.ts` - Mock 适配器
- `prompts/six-segment.template.ts` - 六段式模板
- `prompts/merge-mode.template.ts` - 合并模式模板

**六段式结构**:
1. `intro` - 开场白
2. `introduce` - 书籍介绍
3. `interpret` - 内容解读
4. `review` - 评价讨论
5. `suggest` - 推荐建议
6. `closing` - 结束语

**Mock 兜底**: 当 `DOUBAO_API_KEY` 为空时，返回固定 8 段对话脚本

### 5.4 TTS 模块 (TTS Module)

**路径**: `backend/src/modules/tts/`

**职责**: 文本转语音合成

**关键文件**:
- `tts.controller.ts` - TTS 接口控制器
- `tts.service.ts` - TTS 业务逻辑
- `adapters/tts.adapter.ts` - TTS 适配器接口
- `adapters/volcengine.adapter.ts` - 火山引擎适配器
- `adapters/azure.adapter.ts` - Azure 适配器
- `adapters/mock-tts.adapter.ts` - Mock 适配器
- `adapters/xiaomi-mimo.adapter.ts` - 小米 Mimo 适配器

**适配器接口**:
```typescript
interface TtsAdapter {
  synthesize(text: string, voiceId: string): Promise<Buffer>;
  listVoices(): Promise<Voice[]>;
}
```

**Mock 兜底**: 当 `VOLC_TTS_APP_ID` 为空时，返回 1s 静音 MP3

### 5.5 混音模块 (Mix Module)

**路径**: `backend/src/modules/mix/`

**职责**: TTS 音频 + BGM 混流

**关键文件**:
- `mix.service.ts` - 混音业务逻辑
- `ffmpeg.util.ts` - FFmpeg 工具函数
- `mix.processor.ts` - 混音队列处理器

**混音流程**:
1. 拼接 TTS 片段
2. 叠加 BGM 背景音乐
3. 应用渐入渐出效果
4. 峰值限制 (-3dB)

### 5.6 流水线模块 (Pipeline Module)

**路径**: `backend/src/modules/pipeline/`

**职责**: 端到端播客生成流水线编排

**关键文件**:
- `pipeline.controller.ts` - 流水线接口控制器
- `pipeline.service.ts` - 流水线业务逻辑
- `pipeline.tokens.ts` - 依赖注入令牌
- `progress.ts` - 进度报告工具
- `steps/step1-metadata.ts` - 步骤1: 元数据获取
- `steps/step2-script.ts` - 步骤2: 脚本生成
- `steps/step3-tts-mix.ts` - 步骤3: TTS + 混音
- `steps/step4-export.ts` - 步骤4: 导出

**流水线状态机**:
```
isbns empty → failed (70001)
step 1 all fail → failed (70002)
step 1 partial fail → continue with first success
step 2 throws → partial
step 3 throws → partial
step 4 throws → partial
all success → success
```

**进度报告**: 通过 `ProgressCallback` 回调报告各阶段进度

### 5.7 队列模块 (Queue Module)

**路径**: `backend/src/modules/queue/`

**职责**: BullMQ 异步任务队列管理

**关键文件**:
- `queue.service.ts` - 队列服务
- `constants.ts` - 队列名称常量
- `processors/metadata.processor.ts` - 元数据处理器
- `processors/script.processor.ts` - 脚本处理器
- `processors/tts.processor.ts` - TTS 处理器
- `processors/subtitle.processor.ts` - 字幕处理器
- `processors/mix.processor.ts` - 混音处理器

**队列配置**:
- `podcast:metadata` - 元数据队列
- `podcast:script` - 脚本队列
- `podcast:tts` - TTS 队列
- `podcast:mix` - 混音队列

**重试策略**: `attempts=3, backoff={type:'exponential', delay:2000}`

### 5.8 WebSocket 模块 (WS Module)

**路径**: `backend/src/modules/ws/`

**职责**: 实时进度推送

**关键文件**:
- `progress.gateway.ts` - WebSocket 网关
- `progress-event.dto.ts` - 进度事件 DTO

**事件格式**:
```typescript
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

### 5.9 存储模块 (Storage Module)

**路径**: `backend/src/modules/storage/`

**职责**: 对象存储抽象层

**关键文件**:
- `storage.service.ts` - 存储服务
- `adapters/storage.adapter.ts` - 存储适配器接口
- `adapters/minio.adapter.ts` - MinIO 适配器
- `adapters/local-storage.adapter.ts` - 本地存储适配器

**适配器接口**:
```typescript
interface StorageAdapter {
  put(key: string, buffer: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expires: number): Promise<string>;
}
```

---

## 6. 数据模型

### 6.1 ER 图

```mermaid
erDiagram
    USERS ||--o{ PROJECTS : owns
    USERS ||--o{ USER_PREFERENCES : has
    PROJECTS ||--o{ PROJECT_BOOKS : contains
    PROJECTS ||--o{ SCRIPTS : has
    PROJECTS ||--o{ AUDIO_FILES : produces
    PROJECTS ||--o{ SUBTITLE_FILES : produces
    PROJECTS ||--o{ VOICE_CONFIGS : configures
    PROJECTS ||--o{ BGM_CONFIGS : configures
    PROJECTS ||--o{ JOBS : tracks
    PROJECTS ||--o{ SHARE_LINKS : has
    SCRIPTS ||--o{ SCRIPT_SEGMENTS : contains
    BGM_CONFIGS }o--|| BGM_TRACKS : uses
```

### 6.2 核心模型

#### User (用户)

```typescript
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  phone        String?  @unique
  passwordHash String   @map("password_hash")
  nickname     String
  avatarUrl    String?  @map("avatar_url")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  projects     Project[]
  preferences  UserPreference[]
  errorLogs    ErrorLog[]
}
```

#### Project (项目)

```typescript
model Project {
  id           String   @id @default(uuid())
  userId       String?  @map("user_id")
  title        String
  coverUrl     String?  @map("cover_url")
  mode         String   // independent | merged
  scriptTemplate String? @map("script_template")
  status       String   @default("draft") // draft|generating|done|failed|cancelled|partial
  progress     Int      @default(0)
  currentStage String?  @map("current_stage")
  voiceVolume  Int      @default(80) @map("voice_volume")
  subtitleOn   Boolean  @default(true) @map("subtitle_on")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
}
```

**状态流转**:
- `draft` → `generating` → `done`
- `draft` → `generating` → `failed`
- `draft` → `generating` → `cancelled`
- `draft` → `generating` → `partial`

#### Script (脚本)

```typescript
model Script {
  id        String   @id @default(uuid())
  projectId String   @map("project_id")
  version   Int      @default(1)
  content   String   @db.Text  // TipTap JSON
  rawText   String   @db.Text  @map("raw_text")
  wordCount Int      @default(0) @map("word_count")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
}
```

#### ScriptSegment (脚本片段)

```typescript
model ScriptSegment {
  id         String  @id @default(uuid())
  scriptId   String  @map("script_id")
  orderIndex Int     @map("order_index")
  speaker    String  // host | guest
  text       String  @db.Text
  emotion    String
  stage      String  // intro|introduce|interpret|review|suggest|closing
  startTime  Int?    @map("start_time")
  endTime    Int?    @map("end_time")
}
```

### 6.3 Prisma Schema 位置

`backend/prisma/schema.prisma` (244 行)

---

## 7. API 接口

### 7.1 认证接口

| Method | Path | 描述 |
|--------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/refresh` | 刷新令牌 |
| GET | `/api/auth/me` | 获取当前用户 |

### 7.2 图书接口

| Method | Path | 描述 |
|--------|------|------|
| POST | `/api/books/metadata` | ISBN 批量拉取元数据（异步） |
| GET | `/api/books/metadata/:jobId` | 查询元数据任务结果 |

### 7.3 项目接口

| Method | Path | 描述 |
|--------|------|------|
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects` | 项目列表 |
| GET | `/api/projects/:id` | 项目详情 |
| PATCH | `/api/projects/:id` | 更新项目配置 |
| POST | `/api/projects/:id/generate` | 启动生成流水线 |
| POST | `/api/projects/:id/cancel` | 取消生成 |
| POST | `/api/projects/:id/regenerate` | 重新生成 |
| POST | `/api/projects/sync` | 游客项目同步 |
| DELETE | `/api/projects/:id` | 删除项目 |

### 7.4 脚本接口

| Method | Path | 描述 |
|--------|------|------|
| GET | `/api/projects/:id/script` | 获取脚本 |
| PUT | `/api/projects/:id/script` | 保存脚本 |

### 7.5 TTS 接口

| Method | Path | 描述 |
|--------|------|------|
| POST | `/api/tts/preview` | 试听音色（≤10s） |
| GET | `/api/tts/voices` | 可用音色列表 |

### 7.6 BGM 接口

| Method | Path | 描述 |
|--------|------|------|
| GET | `/api/bgm/tracks` | 曲库列表 |
| GET | `/api/bgm/categories` | 曲库分类 |

### 7.7 导出接口

| Method | Path | 描述 |
|--------|------|------|
| GET | `/api/projects/:id/export` | 多格式导出 |
| GET | `/api/projects/:id/audio` | 获取音频 URL |
| GET | `/api/projects/:id/subtitle` | 获取字幕 |

### 7.8 分享接口

| Method | Path | 描述 |
|--------|------|------|
| POST | `/api/projects/:id/share` | 创建分享链接 |
| GET | `/api/share/:token` | 访问分享内容 |

### 7.9 用户偏好接口

| Method | Path | 描述 |
|--------|------|------|
| GET | `/api/users/me/preferences` | 获取用户偏好 |
| PATCH | `/api/users/me/preferences` | 更新用户偏好 |

### 7.10 健康检查

| Method | Path | 描述 |
|--------|------|------|
| GET | `/health` | 服务健康检查 |

### 7.11 WebSocket

| Path | 描述 |
|------|------|
| `/ws/progress?projectId=...` | 进度推送 |

---

## 8. 关键类与函数

### 8.1 后端关键类

#### PipelineService

**路径**: `backend/src/modules/pipeline/pipeline.service.ts`

**职责**: 端到端流水线编排

**关键方法**:
```typescript
class PipelineService {
  async runFullPipeline(
    input: PipelineInput,
    options: RunFullPipelineOptions = {},
  ): Promise<PipelineResult>;
}
```

**错误码**:
- `70001` - ISBN 列表为空
- `70002` - 步骤1全部失败
- `70003` - 步骤2失败（脚本生成）
- `70004` - 步骤3失败（TTS + 混音）
- `70005` - 步骤4失败（导出）

#### AuthService

**路径**: `backend/src/modules/auth/auth.service.ts`

**职责**: 用户认证与令牌管理

**关键方法**:
```typescript
class AuthService {
  async register(dto: RegisterDto): Promise<User>;
  async login(dto: LoginDto): Promise<{ accessToken; refreshToken }>;
  async refresh(dto: RefreshDto): Promise<{ accessToken }>;
  async validateUser(userId: string): Promise<User>;
}
```

#### BookService

**路径**: `backend/src/modules/book/book.service.ts`

**职责**: 图书元数据获取

**关键方法**:
```typescript
class BookService {
  async fetchMetadata(isbns: string[]): Promise<BookMetadata[]>;
  async fetchByIsbn(isbn: string): Promise<BookMetadata>;
}
```

#### ScriptService

**路径**: `backend/src/modules/script/script.service.ts`

**职责**: AI 脚本生成

**关键方法**:
```typescript
class ScriptService {
  async generateScript(book: BookMetadata, template: string): Promise<ScriptSegment[]>;
  async saveScript(projectId: string, content: string): Promise<Script>;
}
```

#### TtsService

**路径**: `backend/src/modules/tts/tts.service.ts`

**职责**: TTS 语音合成

**关键方法**:
```typescript
class TtsService {
  async synthesize(text: string, voiceId: string): Promise<Buffer>;
  async listVoices(): Promise<Voice[]>;
  async preview(text: string, voiceId: string): Promise<Buffer>;
}
```

#### MixService

**路径**: `backend/src/modules/mix/mix.service.ts`

**职责**: 音频混音

**关键方法**:
```typescript
class MixService {
  async mixAudio(segments: Buffer[], bgm: Buffer, options: MixOptions): Promise<Buffer>;
}
```

### 8.2 前端关键类

#### Zustand Stores

**Auth Store** (`store/auth.store.ts`):
```typescript
interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  init(): void;
  login(email: string, password: string): Promise<void>;
  register(data: RegisterData): Promise<void>;
  logout(): void;
}
```

**Project Store** (`store/project.store.ts`):
```typescript
interface ProjectStore {
  currentProject: Project | null;
  projects: Project[];
  fetchProject(id: string): Promise<void>;
  createProject(data: CreateProjectData): Promise<Project>;
  updateProject(id: string, data: UpdateProjectData): Promise<void>;
}
```

**Progress Store** (`store/progress.store.ts`):
```typescript
interface ProgressStore {
  progress: number;
  stage: string;
  message: string;
  updateProgress(event: ProgressEvent): void;
  reset(): void;
}
```

**UI Store** (`store/ui.store.ts`):
```typescript
interface UiStore {
  theme: 'light' | 'dark';
  language: string;
  setTheme(theme: 'light' | 'dark'): void;
  setLanguage(lang: string): void;
}
```

#### API Client

**路径**: `frontend/src/api/client.ts`

**职责**: Axios 实例配置，拦截器，重试机制

**关键配置**:
- 请求拦截器: 注入 Bearer Token
- 响应拦截器: 统一错误处理
- 重试机制: 3 次指数退避
- 401 处理: 自动刷新令牌

#### WebSocket Client

**路径**: `frontend/src/ws/socket.ts`

**职责**: Socket.IO 客户端，进度订阅

**关键功能**:
- 连接管理
- 房间订阅（按 projectId）
- 断线重连
- 进度事件处理

---

## 9. 依赖关系

### 9.1 Monorepo 依赖

```
podcast-platform (root)
├── frontend
│   └── @podcast-platform/shared
├── backend
│   └── @podcast-platform/shared
└── shared
```

### 9.2 后端模块依赖

```
AppModule
├── ConfigModule (全局)
├── LoggerModule (全局)
├── ThrottlerModule (全局)
├── PrismaModule
├── AuthModule
│   └── UserModule
├── ProjectModule
│   ├── BookModule
│   ├── ScriptModule
│   ├── TtsModule
│   ├── BgmModule
│   ├── SubtitleModule
│   ├── MixModule
│   └── StorageModule
├── QueueModule
│   └── Processors (metadata, script, tts, subtitle, mix)
├── WsModule
├── ExportModule
└── PipelineModule
    ├── BookModule
    ├── ScriptModule
    ├── TtsModule
    └── StorageModule
```

### 9.3 第三方依赖

#### 前端依赖

| 依赖 | 用途 |
|------|------|
| react, react-dom | UI 框架 |
| react-router-dom | 路由 |
| @mui/material | 组件库 |
| zustand | 状态管理 |
| axios, axios-retry | HTTP 客户端 |
| socket.io-client | WebSocket |
| wavesurfer.js | 音频波形 |
| @tiptap/react | 富文本编辑 |
| i18next, react-i18next | 国际化 |

#### 后端依赖

| 依赖 | 用途 |
|------|------|
| @nestjs/* | 后端框架 |
| @prisma/client | ORM |
| bullmq | 任务队列 |
| socket.io | WebSocket |
| passport, @nestjs/jwt | 认证 |
| fluent-ffmpeg | 音频处理 |
| minio | 对象存储 |
| pdfkit | PDF 生成 |
| archiver | ZIP 打包 |
| pino | 日志 |

---

## 10. 运行与部署

### 10.1 环境要求

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### 10.2 快速开始

#### 方式 A: Docker Compose（推荐）

```bash
# 1. 克隆项目
git clone <repo-url>
cd podcast-platform

# 2. 复制环境变量
cp .env.example .env

# 3. 安装依赖
pnpm install

# 4. 启动服务
docker compose up -d

# 5. 健康检查
curl http://localhost:3001/health
# => {"status":"ok"}

# 6. 访问前端
open http://localhost:5173
```

#### 方式 B: 本地开发模式

```bash
# 1. 安装依赖
pnpm install

# 2. 启动数据库
docker compose up postgres redis minio -d

# 3. 运行数据库迁移
pnpm prisma:migrate

# 4. 灌入 BGM 种子数据
pnpm seed:bgm

# 5. 启动开发服务器
pnpm dev
```

### 10.3 端口分配

| 服务 | 端口 |
|------|------|
| 前端 (Nginx) | 5173 |
| 后端 (NestJS) | 3001 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO API | 9000 |
| MinIO Console | 9001 |

### 10.4 环境变量

#### 后端环境变量

```bash
# 数据库
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/podcast

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=change-me
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=podcast

# 第三方 API（可选，留空使用 Mock）
DOUBAO_API_KEY=
VOLC_TTS_APP_ID=
AZURE_TTS_KEY=

# 服务配置
PORT=3001
LOG_LEVEL=info
CORS_ORIGINS=http://localhost:5173
```

#### 前端环境变量

```bash
VITE_API_BASE_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
VITE_DEFAULT_LANG=zh-CN
```

### 10.5 部署架构

```
┌─────────────────────────────────────────────────────────┐
│                    Production Deployment                 │
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │   Vercel    │    │   Render    │    │   Neon      │ │
│  │  (Frontend) │    │  (Backend)  │    │(PostgreSQL) │ │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘ │
│         │                  │                  │         │
│         └──────────────────┼──────────────────┘         │
│                            │                            │
│                     ┌──────┴──────┐                     │
│                     │   Upstash   │                     │
│                     │   (Redis)   │                     │
│                     └─────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

**部署平台**:
- **前端**: Vercel (Hobby free tier)
- **后端**: Render (Free tier + Docker)
- **数据库**: Neon PostgreSQL (免费层)
- **Redis**: Upstash (免费层)

**详细部署指南**: `docs/deploy.md`

---

## 11. 开发指南

### 11.1 常用命令

```bash
# 开发
pnpm dev                  # 同时启前后端
pnpm dev:frontend         # 只启前端
pnpm dev:backend          # 只启后端

# 构建
pnpm build                # 构建前后端

# 测试
pnpm test                 # 运行所有测试
pnpm --filter frontend test  # 前端测试
pnpm --filter backend test   # 后端测试

# 数据库
pnpm prisma:generate      # 生成 Prisma Client
pnpm prisma:migrate       # 运行迁移
pnpm prisma:studio        # 打开 Prisma Studio

# 种子数据
pnpm seed:bgm             # 灌入 BGM 数据

# Docker
pnpm docker:up            # 启动容器
pnpm docker:down          # 停止容器
```

### 11.2 测试

#### 前端测试

```bash
cd frontend
pnpm test                 # Vitest
```

**测试覆盖率**: 15 个测试文件，153 个测试通过

#### 后端测试

```bash
cd backend
pnpm test                 # Jest 单元测试
pnpm test:e2e             # E2E 测试
```

**测试覆盖率**: 9 个测试套件，45 个测试通过

#### E2E 测试前置条件

```bash
# 启动数据库
docker compose up postgres redis minio -d

# 运行迁移
cd backend
pnpm prisma:migrate

# 运行 E2E
pnpm test:e2e
```

### 11.3 Mock 兜底机制

| 第三方 | 检测变量 | Mock 行为 |
|--------|----------|-----------|
| Open Library | `OPENLIBRARY_BASE` 不可达 | 返回 5 本示例书 |
| Google Books | 同上 | 返回 3 本示例书 |
| 豆包 LLM | `DOUBAO_API_KEY` 为空 | 返回固定 8 段对话脚本 |
| 火山 TTS | `VOLC_TTS_APP_ID` 为空 | 返回 1s 静音 MP3 |
| Azure TTS | `AZURE_TTS_KEY` 为空 | 同上 |

### 11.4 错误码规范

| 范围 | 模块 | 说明 |
|------|------|------|
| 0 | - | 成功 |
| 1xxx | 通用 | 10001 参数错误 / 10002 未授权 / 10003 禁止 / 10004 资源不存在 / 10005 限流 |
| 2xxx | 用户 | 20001 邮箱已注册 / 20002 密码错误 / 20003 token 过期 |
| 3xxx | ISBN/图书 | 30001 ISBN 格式非法 / 30002 元数据抓取失败 / 30003 重试超限 |
| 4xxx | 脚本/AI | 40001 LLM 调用失败 / 40002 脚本超长/过短 / 40003 内容合规拒绝 |
| 5xxx | TTS | 50001 音色不存在 / 50002 合成失败 / 50003 试听超限 |
| 6xxx | 任务 | 60001 任务不存在 / 60002 任务已结束 / 60003 取消失败 |
| 7xxx | 流水线 | 70001 ISBN 为空 / 70002 元数据全失败 / 70003 脚本失败 / 70004 TTS 失败 / 70005 导出失败 |
| 9xxx | 系统 | 90001 内部错误 / 90002 第三方超时 / 90003 存储失败 |

### 11.5 统一响应格式

```typescript
// 成功
{
  "code": 0,
  "data": T,
  "message": "ok",
  "traceId": "uuid"
}

// 失败
{
  "code": 10001,
  "data": null,
  "message": "ISBN 格式错误",
  "traceId": "uuid"
}
```

### 11.6 代码规范

- **TypeScript**: 严格模式
- **ESLint**: 代码检查
- **Prettier**: 代码格式化
- **Conventional Commits**: 提交规范

---

## 附录

### A. 相关文档

- `README.md` - 项目说明
- `CHANGELOG.md` - 变更日志
- `HANDOFF.md` - 交接文档
- `TEST_REPORT.md` - 测试报告
- `docs/architecture.md` - 架构设计文档
- `docs/api-contract.md` - API 契约
- `docs/deploy.md` - 部署指南
- `docs/podcast-platform-prd.md` - 产品需求文档

### B. 版本历史

- **v0.1.1** (2026-06-14) - 增强功能，修复问题
- **v0.1.0** (2026-06-14) - 初始交接版本

### C. 许可证

MIT

---

*本文档由 Claude Code 自动生成，最后更新: 2026-06-17*
