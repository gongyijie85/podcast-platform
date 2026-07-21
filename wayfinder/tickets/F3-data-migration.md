# F3 — 确认现有 Neon 数据与对象文件

> 类型：task / HITL
> 状态：🟡 数据审计完成，等待远端对象存储凭据
> 标签：`wayfinder:task`

## Question

确认 Render 当前生产环境是否已经使用现有 Neon；保护现有 Neon 数据，并单独处理音频/封面对象文件。

## 前置条件

- F1 完成，确认目标运行时的数据库和对象存储连接串
- 不得在未备份、未确认来源的情况下覆盖现有 Neon

## 当前审计结果（2026-07-21）

- 现有 Neon 连接可读，当前计数为：`users=6`、`projects=12`、`book_library_items=240`、`audio_files=97`。
- Neon 有 10 条 Prisma migration，其中 `20260708000000_book_enrichment` 尚未应用；只增加可空字段，部署时由 `prisma migrate deploy` 补齐。
- 本地 `backend/storage` 约 90 个文件；数据库中的 97 个音频 key 有 72 个本地匹配、25 个缺失。12 个 BGM key 均有本地匹配。
- Render 生产数据库身份仍未从 Render 环境变量确认；因此禁止新建数据库或覆盖现有 Neon。
- Upstash/B2 凭据尚未出现；在对象端点确认前，Northflank 只能做启动验证，不能宣称音频迁移完成。

## 行动清单（HITL，约 30-60 分钟）

### 1. 比较 Render 与现有 Neon 的数据库来源

```powershell
# Windows PowerShell
$env:RENDER_DATABASE_URL="postgresql://user:pass@host/db"  # 仅从 Render Dashboard 读取
$env:NEON_DATABASE_URL="postgresql://...neon.tech/..."       # 来自现有本地 .env 或 Neon 控制台
psql $env:RENDER_DATABASE_URL -Atc "select current_database(), inet_server_addr();"
psql $env:NEON_DATABASE_URL -Atc "select current_database(), inet_server_addr();"
```

如果两者是同一个 Neon 主机，跳过数据库 dump，只做连接验证；不要重复导入。
如果不同，先导出到独立文件，并导入新的 Neon branch/project，不要直接覆盖现有 Neon。

### 2. 仅在确认 Render 是独立数据库时导出

```powershell
pg_dump $env:RENDER_DATABASE_URL --no-owner --format=custom --file=render_dump.dump
```

### 3. 对象文件单独核对

拿到 Render/MinIO/B2 的对象端点后，导出对象清单，与 Neon `audio_files.storage_key` 逐项比对；数据库记录不会自动搬运 MP3、字幕或 BGM。先上传，再抽样下载校验，最后才切换 `STORAGE_DRIVER=minio`。

### 4. 跑 Prisma migration

```powershell
cd D:\Broadcast\podcast-platform\backend
$env:DATABASE_URL = $env:NEON_DATABASE_URL
pnpm exec prisma migrate deploy
```

### 5. 验证

```powershell
psql $env:NEON_DATABASE_URL -c "SELECT count(*) FROM users; SELECT count(*) FROM projects; SELECT count(*) FROM book_library_items;"
```

期望：和来源数据库数字一致；当前现有 Neon 已有 6 users、12 projects、240 book_library_items、97 audio_files。

## 完成后

把来源数据库身份、验证 SQL 结果、对象清单差异和上传校验结果写进本 ticket 评论。
关单，启动 F4（首次部署）。
